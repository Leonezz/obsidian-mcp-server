#!/usr/bin/env bash
#
# obsidian-mcp.sh — Helper script for interacting with the Obsidian MCP Server.
#
# Usage:
#   obsidian-mcp.sh init                     # Initialize a new MCP session
#   obsidian-mcp.sh call <tool> [json_args]  # Call a tool (auto-inits if needed)
#   obsidian-mcp.sh tools                    # List available tools
#
# Environment variables:
#   OBSIDIAN_MCP_TOKEN  (required)  Bearer token from Obsidian plugin settings
#   OBSIDIAN_MCP_HOST   (optional)  Server host (default: 127.0.0.1)
#   OBSIDIAN_MCP_PORT   (optional)  Server port (default: 27123)
#
set -euo pipefail

readonly HOST="${OBSIDIAN_MCP_HOST:-127.0.0.1}"
readonly PORT="${OBSIDIAN_MCP_PORT:-27123}"
readonly BASE_URL="http://${HOST}:${PORT}/mcp"
readonly SESSION_FILE="/tmp/obsidian-mcp-session"
readonly REQUEST_ID_FILE="/tmp/obsidian-mcp-reqid"

# ---------- helpers ----------

die() {
  echo "Error: $*" >&2
  exit 1
}

check_deps() {
  for cmd in curl jq; do
    command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is required but not installed."
  done
}

check_token() {
  [[ -n "${OBSIDIAN_MCP_TOKEN:-}" ]] || die "OBSIDIAN_MCP_TOKEN is not set. Get it from Obsidian Settings > Obsidian MCP Server."
}

next_id() {
  local id=1
  if [[ -f "$REQUEST_ID_FILE" ]]; then
    id=$(( $(cat "$REQUEST_ID_FILE") + 1 ))
  fi
  echo "$id" > "$REQUEST_ID_FILE"
  echo "$id"
}

get_session() {
  [[ -f "$SESSION_FILE" ]] && cat "$SESSION_FILE" || echo ""
}

# Send a JSON-RPC request and return the response body.
# Writes the session id header to SESSION_FILE on init.
rpc() {
  local body="$1"
  local session
  session="$(get_session)"

  local -a headers=(
    -H "Content-Type: application/json"
    -H "Authorization: Bearer ${OBSIDIAN_MCP_TOKEN}"
  )
  if [[ -n "$session" ]]; then
    headers+=(-H "mcp-session-id: ${session}")
  fi

  local http_code response_body header_file
  header_file="$(mktemp)"

  response_body="$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL" \
    -D "$header_file" \
    "${headers[@]}" \
    -d "$body")"

  http_code="$(echo "$response_body" | tail -1)"
  response_body="$(echo "$response_body" | sed '$d')"

  # Capture session id from response headers
  local new_session
  new_session="$(grep -i '^mcp-session-id:' "$header_file" 2>/dev/null | awk '{print $2}' | tr -d '\r' || true)"
  if [[ -n "$new_session" ]]; then
    echo "$new_session" > "$SESSION_FILE"
  fi
  rm -f "$header_file"

  case "$http_code" in
    200|202) ;;
    401) die "Authentication failed. Check your OBSIDIAN_MCP_TOKEN." ;;
    404)
      # Session expired — caller can retry
      rm -f "$SESSION_FILE"
      echo "__SESSION_EXPIRED__"
      return 0
      ;;
    *)  die "HTTP $http_code: $response_body" ;;
  esac

  echo "$response_body"
}

# ---------- commands ----------

do_init() {
  # Remove stale session
  rm -f "$SESSION_FILE" "$REQUEST_ID_FILE"

  local id
  id="$(next_id)"

  # Step 1: initialize
  local init_body
  init_body="$(jq -n --argjson id "$id" '{
    jsonrpc: "2.0",
    id: $id,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "openclaw-skill", version: "1.0.0" }
    }
  }')"

  local resp
  resp="$(rpc "$init_body")"

  if [[ "$resp" == "__SESSION_EXPIRED__" ]]; then
    die "Failed to initialize session."
  fi

  # Check for error in response
  local err
  err="$(echo "$resp" | jq -r '.error.message // empty' 2>/dev/null || true)"
  if [[ -n "$err" ]]; then
    die "Init failed: $err"
  fi

  # Step 2: send initialized notification
  local notif_body='{"jsonrpc":"2.0","method":"notifications/initialized"}'
  rpc "$notif_body" >/dev/null

  local session
  session="$(get_session)"
  if [[ -z "$session" ]]; then
    die "No session ID received from server."
  fi

  echo "$session"
}

ensure_session() {
  local session
  session="$(get_session)"
  if [[ -z "$session" ]]; then
    do_init >/dev/null
  fi
}

do_call() {
  local tool="$1"
  local args="${2:-"{}"}"

  ensure_session

  local id
  id="$(next_id)"

  local body
  body="$(jq -n --argjson id "$id" --arg tool "$tool" --argjson args "$args" '{
    jsonrpc: "2.0",
    id: $id,
    method: "tools/call",
    params: { name: $tool, arguments: $args }
  }')"

  local resp
  resp="$(rpc "$body")"

  # Retry once on stale session
  if [[ "$resp" == "__SESSION_EXPIRED__" ]]; then
    do_init >/dev/null
    id="$(next_id)"
    body="$(jq -n --argjson id "$id" --arg tool "$tool" --argjson args "$args" '{
      jsonrpc: "2.0",
      id: $id,
      method: "tools/call",
      params: { name: $tool, arguments: $args }
    }')"
    resp="$(rpc "$body")"
    if [[ "$resp" == "__SESSION_EXPIRED__" ]]; then
      die "Session expired and re-init failed."
    fi
  fi

  # Pretty-print the result
  echo "$resp" | jq .
}

do_tools() {
  ensure_session

  local id
  id="$(next_id)"

  local body
  body="$(jq -n --argjson id "$id" '{
    jsonrpc: "2.0",
    id: $id,
    method: "tools/list",
    params: {}
  }')"

  local resp
  resp="$(rpc "$body")"

  if [[ "$resp" == "__SESSION_EXPIRED__" ]]; then
    do_init >/dev/null
    id="$(next_id)"
    body="$(jq -n --argjson id "$id" '{
      jsonrpc: "2.0",
      id: $id,
      method: "tools/list",
      params: {}
    }')"
    resp="$(rpc "$body")"
    if [[ "$resp" == "__SESSION_EXPIRED__" ]]; then
      die "Session expired and re-init failed."
    fi
  fi

  echo "$resp" | jq '.result.tools[] | {name, description}'
}

# ---------- main ----------

check_deps
check_token

case "${1:-}" in
  init)
    session="$(do_init)"
    echo "Session initialized: $session"
    ;;
  call)
    [[ -n "${2:-}" ]] || die "Usage: $0 call <tool_name> [json_args]"
    do_call "$2" "${3:-"{}"}"
    ;;
  tools)
    do_tools
    ;;
  *)
    echo "Usage: $0 {init|call|tools}"
    echo ""
    echo "Commands:"
    echo "  init                     Initialize a new MCP session"
    echo "  call <tool> [json_args]  Call a tool with optional JSON arguments"
    echo "  tools                    List available tools"
    echo ""
    echo "Environment:"
    echo "  OBSIDIAN_MCP_TOKEN  (required)  Auth token from Obsidian settings"
    echo "  OBSIDIAN_MCP_HOST   (optional)  Server host (default: 127.0.0.1)"
    echo "  OBSIDIAN_MCP_PORT   (optional)  Server port (default: 27123)"
    exit 1
    ;;
esac
