#!/usr/bin/env bash
#
# Deploys the current commit to Heroku using the Heroku Platform API:
# packages the code, uploads it, builds it, then checks the new release
# starts and stays up.
#
# Needs:
#   HEROKU_API_KEY   an API key allowed to deploy the app
#   HEROKU_APP_NAME  the Heroku app to deploy to
#
# Uses git, curl and jq, which are all on GitHub's Ubuntu runners.

set -euo pipefail

: "${HEROKU_API_KEY:?HEROKU_API_KEY is not set}"
: "${HEROKU_APP_NAME:?HEROKU_APP_NAME is not set}"
api="${HEROKU_API_URL:-https://api.heroku.com}"
app_api="$api/apps/$HEROKU_APP_NAME"

# Heroku stops a web dyno that has not started serving within 60 seconds.
boot_timeout_seconds=60

fail() {
  echo "::error::$1"
  exit 1
}

heroku_api() {
  curl --fail-with-body --silent --show-error \
    --header "Accept: application/vnd.heroku+json; version=3" \
    --header "Authorization: Bearer $HEROKU_API_KEY" \
    "$@"
}

version="$(git rev-parse HEAD)"
archive="$(mktemp)"
trap 'rm -f "$archive"' EXIT

echo "Packaging $version"
git archive --format=tar.gz --output="$archive" HEAD

echo "Uploading the code to Heroku"
sources="$(heroku_api --request POST "$api/sources")"
put_url="$(jq -r '.source_blob.put_url' <<<"$sources")"
get_url="$(jq -r '.source_blob.get_url' <<<"$sources")"
curl --fail --silent --show-error --request PUT --header 'Content-Type:' \
  --data-binary @"$archive" "$put_url"

echo "Starting the build"
build_request="$(jq -n --arg url "$get_url" --arg version "$version" \
  '{source_blob: {url: $url, version: $version}}')"
build="$(heroku_api --request POST --header "Content-Type: application/json" \
  --data "$build_request" "$app_api/builds")"
build_id="$(jq -r '.id' <<<"$build")"
output_stream_url="$(jq -r '.output_stream_url' <<<"$build")"

# The build log streams until the build finishes. A broken stream does not
# fail the deploy, because the build status below is what counts.
echo "::group::Heroku build log"
curl --silent --show-error --max-time 900 "$output_stream_url" || true
echo "::endgroup::"

status=pending
for _ in $(seq 1 30); do
  build="$(heroku_api "$app_api/builds/$build_id")"
  status="$(jq -r '.status' <<<"$build")"
  [ "$status" != pending ] && break
  sleep 10
done

case "$status" in
  succeeded) ;;
  failed) fail "The Heroku build failed. See the build log above." ;;
  pending) fail "Timed out waiting for the Heroku build to finish." ;;
  *) fail "Unexpected Heroku build status: $status" ;;
esac

release_id="$(jq -r '.release.id' <<<"$build")"
echo "Build succeeded. Waiting for the new release to start."

# Prints how many web dynos are on the new release in the given state.
count_web_dynos() {
  heroku_api "$app_api/dynos" | jq --arg release "$release_id" --arg state "$1" \
    '[.[] | select(.type == "web" and .release.id == $release)] | map(select(.state == $state)) | length'
}

started=false
for _ in $(seq 1 18); do
  if [ "$(count_web_dynos up)" -gt 0 ]; then
    started=true
    break
  fi
  sleep 10
done
[ "$started" = true ] || fail "The new release did not start within 3 minutes."

# A web dyno that never starts serving is stopped after the boot timeout,
# so check it is still up once that has passed.
sleep "$boot_timeout_seconds"
[ "$(count_web_dynos crashed)" -eq 0 ] || fail "The new release crashed after starting. Check the Heroku logs."
[ "$(count_web_dynos up)" -gt 0 ] || fail "The new release is not running. Check the Heroku logs."

echo "Deployed $version to $HEROKU_APP_NAME"
