#!/usr/bin/env bash
set -euo pipefail

archive="${1:-}"
if [[ -z "$archive" || ! -f "$archive" ]]; then
  echo "A deployment archive path is required" >&2
  exit 2
fi

site_endpoint="${APPWRITE_SITE_ENDPOINT:-${APPWRITE_ENDPOINT:-}}"
if [[ -z "$site_endpoint" ]]; then
  echo "Missing required environment variable: APPWRITE_SITE_ENDPOINT" >&2
  exit 2
fi

for name in APPWRITE_PROJECT_ID APPWRITE_SITE_ID APPWRITE_DEPLOY_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

# Cached HTML can reference hashed assets removed by the next deployment.
# Check before the first upload, not after activation. Legacy callers without a
# public origin still use the generated-domain lookup below.
if [[ -n "${APPWRITE_SITE_URL:-}" ]]; then
  node --import tsx tools/check-site-deploy-cache.mts "$APPWRITE_SITE_URL"
fi

endpoint="${site_endpoint%/}/sites/$APPWRITE_SITE_ID/deployments"
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
    break
  fi
  if [[ "$status" == "failed" ]]; then
    jq '{id: .["$id"], status, buildLogs}' "$current"
    exit 1
  fi
  sleep 5
done

if [[ "$(jq -r '.status // empty' "$current")" != "ready" ]]; then
  jq '{id: .["$id"], status}' "$current"
  echo "Timed out waiting for Appwrite deployment" >&2
  exit 1
fi

site_url="${APPWRITE_SITE_URL:-}"
if [[ -n "$site_url" ]]; then
  if [[ ! "$site_url" =~ ^https?://[^/?#]+/?$ ]]; then
    echo "APPWRITE_SITE_URL must be an HTTP(S) origin" >&2
    exit 2
  fi
  site_url="${site_url%/}"
else
  # Older callers may not know the configured custom domain. Keep the
  # request-log lookup as a compatibility fallback for generated domains, but
  # do not make a successful deployment depend on request logging being on.
  logs_endpoint="${site_endpoint%/}/sites/$APPWRITE_SITE_ID/logs"
  deployment_query="$(jq -cn --arg id "$deployment_id" '{method:"equal",attribute:"deploymentId",values:[$id]}')"
  site_host=""
  for attempt in $(seq 1 12); do
    logs="$work_dir/site-logs-$attempt.json"
    curl --silent --show-error --fail --get \
      --header "X-Appwrite-Project: $APPWRITE_PROJECT_ID" \
      --header "X-Appwrite-Key: $APPWRITE_DEPLOY_KEY" \
      --data-urlencode "queries[]=$deployment_query" \
      "$logs_endpoint" > "$logs"
    site_host="$(jq -r '[.executions[]? | .requestHeaders[]? | select(.name == "host") | .value[]? | select(endswith(".appwrite.network"))][0] // empty' "$logs")"
    if [[ "$site_host" =~ ^[a-z0-9-]+\.appwrite\.network$ ]]; then
      break
    fi
    site_host=""
    sleep 5
  done

  if [[ -z "$site_host" ]]; then
    echo "Could not resolve the active Appwrite deployment URL from site logs; set APPWRITE_SITE_URL for custom-domain deployments" >&2
    exit 1
  fi
  site_url="https://$site_host"
fi

jq -n \
  --arg id "$deployment_id" \
  --arg status "ready" \
  --arg url "$site_url" \
  --argjson sourceSize "$(jq '.sourceSize' "$current")" \
  --argjson buildSize "$(jq '.buildSize' "$current")" \
  '{id:$id,status:$status,url:$url,sourceSize:$sourceSize,buildSize:$buildSize}'
