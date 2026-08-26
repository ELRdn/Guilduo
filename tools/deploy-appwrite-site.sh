#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"
if [[ -z "$archive" || ! -f "$archive" ]]; then
  echo "A deployment archive path is required" >&2
  exit 2
fi

for name in APPWRITE_ENDPOINT APPWRITE_PROJECT_ID APPWRITE_SITE_ID APPWRITE_DEPLOY_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

endpoint="${APPWRITE_ENDPOINT%/}/sites/$APPWRITE_SITE_ID/deployments"
chunk_size=$((5 * 1024 * 1024))
total_size="$(stat -c '%s' "$archive")"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

deployment_id=""
offset=0
part=0
while (( offset < total_size )); do
  remaining=$((total_size - offset))
  length=$((remaining < chunk_size ? remaining : chunk_size))
  end=$((offset + length - 1))
  chunk="$work_dir/chunk-$part"
  response="$work_dir/response-$part.json"
  dd if="$archive" of="$chunk" bs="$chunk_size" skip="$part" count=1 status=none

  headers=(
    --header "X-Appwrite-Project: $APPWRITE_PROJECT_ID"
    --header "X-Appwrite-Key: $APPWRITE_DEPLOY_KEY"
    --header "Content-Range: bytes $offset-$end/$total_size"
  )
  if [[ -n "$deployment_id" ]]; then
    headers+=(--header "X-Appwrite-ID: $deployment_id")
  fi

  http_status="$(curl --silent --show-error \
    --output "$response" \
    --write-out '%{http_code}' \
    --request POST \
    "${headers[@]}" \
    --form "code=@$chunk;filename=$(basename "$archive");type=application/gzip" \
    --form 'installCommand=' \
    --form 'buildCommand=' \
    --form 'outputDirectory=.' \
    --form 'activate=true' \
    "$endpoint")"

  if [[ "$http_status" -lt 200 || "$http_status" -ge 300 ]]; then
    jq '{message, type, code}' "$response" 2>/dev/null || true
    echo "Appwrite deployment chunk $part failed with HTTP $http_status" >&2
    exit 1
  fi

  current_id="$(jq -er '.["$id"]' "$response")"
  if [[ -z "$deployment_id" ]]; then
    deployment_id="$current_id"
  elif [[ "$current_id" != "$deployment_id" ]]; then
    echo "Appwrite returned a different deployment ID for chunk $part" >&2
    exit 1
  fi

  offset=$((end + 1))
  part=$((part + 1))
done

current="$work_dir/deployment-current.json"
for attempt in $(seq 1 90); do
  curl --silent --show-error --fail \
    --header "X-Appwrite-Project: $APPWRITE_PROJECT_ID" \
    --header "X-Appwrite-Key: $APPWRITE_DEPLOY_KEY" \
    "$endpoint/$deployment_id" > "$current"
  status="$(jq -r '.status // empty' "$current")"
  if [[ "$status" == "ready" ]]; then
    jq '{id: .["$id"], status, sourceSize, buildSize, totalSize, createdAt: .["$createdAt"]}' "$current"
    exit 0
  fi
  if [[ "$status" == "failed" ]]; then
    jq '{id: .["$id"], status, buildLogs}' "$current"
    exit 1
  fi
  sleep 5
done

jq '{id: .["$id"], status}' "$current"
echo "Timed out waiting for Appwrite deployment" >&2
exit 1
