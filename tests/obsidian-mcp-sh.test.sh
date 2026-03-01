#!/usr/bin/env bash
#
# Tests for openclaw-skill/scripts/obsidian-mcp.sh
#
# Uses a mock curl that reads queued responses from numbered files.
# Each call to mock curl pops the next response from the queue.
#
# Usage: bash tests/obsidian-mcp-sh.test.sh
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT_UNDER_TEST="$PROJECT_DIR/openclaw-skill/scripts/obsidian-mcp.sh"

TEST_TMP="$(mktemp -d)"
MOCK_BIN="$TEST_TMP/mockbin"
QUEUE_DIR="$TEST_TMP/queue"
SESSION_FILE="/tmp/obsidian-mcp-session-test-$$"
REQID_FILE="/tmp/obsidian-mcp-reqid-test-$$"

mkdir -p "$MOCK_BIN" "$QUEUE_DIR"

PASSED=0
FAILED=0
TOTAL=0

cleanup() {
  rm -rf "$TEST_TMP"
  rm -f "$SESSION_FILE" "$REQID_FILE"
}
trap cleanup EXIT

# ---------- assertions ----------

assert_exit_code() {
  local expected="$1" actual="$2" label="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$actual" -eq "$expected" ]]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $label"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $label (expected exit $expected, got $actual)"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $label"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $label (output missing '$needle')"
    echo "        got: $(echo "$haystack" | head -5)"
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" label="$3"
  TOTAL=$((TOTAL + 1))
  if echo "$haystack" | grep -qF "$needle"; then
    FAILED=$((FAILED + 1))
    echo "  FAIL: $label (output should not contain '$needle')"
  else
    PASSED=$((PASSED + 1))
    echo "  PASS: $label"
  fi
}

assert_file_exists() {
  local path="$1" label="$2"
  TOTAL=$((TOTAL + 1))
  if [[ -f "$path" ]]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $label"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $label (file not found: $path)"
  fi
}

assert_file_not_exists() {
  local path="$1" label="$2"
  TOTAL=$((TOTAL + 1))
  if [[ ! -f "$path" ]]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $label"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $label (file should not exist: $path)"
  fi
}

assert_equals() {
  local expected="$1" actual="$2" label="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$actual" == "$expected" ]]; then
    PASSED=$((PASSED + 1))
    echo "  PASS: $label"
  else
    FAILED=$((FAILED + 1))
    echo "  FAIL: $label (expected '$expected', got '$actual')"
  fi
}

# ---------- mock curl setup ----------

# Create the mock curl script. It reads from a response queue:
#   $QUEUE_DIR/0.status, $QUEUE_DIR/0.body, $QUEUE_DIR/0.headers
#   $QUEUE_DIR/1.status, $QUEUE_DIR/1.body, $QUEUE_DIR/1.headers
#   ...
# A counter in $QUEUE_DIR/counter tracks which response to serve next.
# It also logs request bodies to $QUEUE_DIR/calls.log.

create_mock_curl() {
  cat > "$MOCK_BIN/curl" <<MOCK_EOF
#!/usr/bin/env bash
QUEUE="$QUEUE_DIR"

# Parse -D and -d from args
dump_file=""
req_body=""
args=("\$@")
i=0
while [[ \$i -lt \${#args[@]} ]]; do
  case "\${args[\$i]}" in
    -D) dump_file="\${args[\$((i+1))]}"; i=\$((i+2)) ;;
    -d) req_body="\${args[\$((i+1))]}"; i=\$((i+2)) ;;
    *)  i=\$((i+1)) ;;
  esac
done

# Log request body
echo "\$req_body" >> "\$QUEUE/calls.log"

# Read and increment counter
counter=0
if [[ -f "\$QUEUE/counter" ]]; then
  counter=\$(cat "\$QUEUE/counter")
fi
echo \$((counter + 1)) > "\$QUEUE/counter"

# Read response for this call index
status="200"
body=""
headers=""
[[ -f "\$QUEUE/\${counter}.status" ]] && status=\$(cat "\$QUEUE/\${counter}.status")
[[ -f "\$QUEUE/\${counter}.body" ]]   && body=\$(cat "\$QUEUE/\${counter}.body")
[[ -f "\$QUEUE/\${counter}.headers" ]] && headers=\$(cat "\$QUEUE/\${counter}.headers")

# Write response headers to dump file
if [[ -n "\$dump_file" ]]; then
  echo "\$headers" > "\$dump_file"
fi

# Simulate curl -w "\n%{http_code}": body, newline, status code
printf '%s\n' "\$body"
printf '%s\n' "\$status"
MOCK_EOF
  chmod +x "$MOCK_BIN/curl"
}

# Queue a response at a specific index
queue_response() {
  local idx="$1" status="$2" body="$3" headers="${4:-}"
  echo "$status"  > "$QUEUE_DIR/${idx}.status"
  echo "$body"    > "$QUEUE_DIR/${idx}.body"
  echo "$headers" > "$QUEUE_DIR/${idx}.headers"
}

# Reset queue and test state between tests
reset() {
  rm -f "$SESSION_FILE" "$REQID_FILE"
  rm -f "$QUEUE_DIR"/*
  echo "0" > "$QUEUE_DIR/counter"
}

# Run the script under test, patching SESSION_FILE, REQUEST_ID_FILE, and PATH
run_script() {
  # We need to patch the hardcoded paths in the script. Use env + sed approach:
  # Create a patched copy that uses our test-specific temp files.
  local patched="$TEST_TMP/patched-script.sh"
  sed \
    -e "s|/tmp/obsidian-mcp-session|${SESSION_FILE}|g" \
    -e "s|/tmp/obsidian-mcp-reqid|${REQID_FILE}|g" \
    "$SCRIPT_UNDER_TEST" > "$patched"
  chmod +x "$patched"
  PATH="$MOCK_BIN:$PATH" bash "$patched" "$@"
}

# Helper: queue standard init responses (initialize + initialized notification)
queue_init_ok() {
  local session_id="${1:-test-session-123}"
  queue_response 0 200 \
    '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{}}}' \
    "mcp-session-id: $session_id"
  queue_response 1 202 "" "mcp-session-id: $session_id"
}

# Like queue_init_ok but starting at a given index
queue_init_ok_at() {
  local start="$1" session_id="${2:-test-session-123}"
  queue_response "$start" 200 \
    '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{}}}' \
    "mcp-session-id: $session_id"
  queue_response "$((start + 1))" 202 "" "mcp-session-id: $session_id"
}

# ---------- tests ----------

create_mock_curl

echo "=== obsidian-mcp.sh tests ==="

# -------- Validation --------

echo ""
echo "--- Validation ---"

reset
echo ""
echo "Test: missing token"
output="$(OBSIDIAN_MCP_TOKEN="" run_script init 2>&1 || true)"
assert_contains "$output" "OBSIDIAN_MCP_TOKEN is not set" "error mentions token"

reset
echo ""
echo "Test: no subcommand shows usage"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script 2>&1 || true)"
assert_contains "$output" "Usage:" "shows usage"
assert_contains "$output" "init" "mentions init"
assert_contains "$output" "call" "mentions call"
assert_contains "$output" "tools" "mentions tools"

reset
echo ""
echo "Test: call without tool name"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script call 2>&1 || true)"
assert_contains "$output" "Usage:" "shows call usage"

# -------- Init --------

echo ""
echo "--- Init ---"

reset
echo ""
echo "Test: successful init"
queue_init_ok "sess-abc"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script init 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "exits 0"
assert_contains "$output" "Session initialized" "prints session message"
assert_contains "$output" "sess-abc" "prints session ID"
assert_file_exists "$SESSION_FILE" "session file created"
assert_equals "sess-abc" "$(cat "$SESSION_FILE")" "session file content"

reset
echo ""
echo "Test: init with 401 auth failure"
queue_response 0 401 '{"error":"unauthorized"}'
output="$(OBSIDIAN_MCP_TOKEN="bad" run_script init 2>&1 || true)"
assert_contains "$output" "Authentication failed" "reports auth failure"
assert_file_not_exists "$SESSION_FILE" "no session on auth failure"

reset
echo ""
echo "Test: init with MCP error response"
queue_response 0 200 \
  '{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"Invalid request"}}' \
  "mcp-session-id: err-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script init 2>&1 || true)"
assert_contains "$output" "Init failed" "reports init failure"
assert_contains "$output" "Invalid request" "includes error message"

reset
echo ""
echo "Test: init with 500 server error"
queue_response 0 500 '{"error":"internal"}'
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script init 2>&1 || true)"
assert_contains "$output" "HTTP 500" "reports HTTP 500"

reset
echo ""
echo "Test: init with 404"
queue_response 0 404 ""
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script init 2>&1 || true)"
assert_contains "$output" "Failed to initialize session" "reports init failure on 404"

reset
echo ""
echo "Test: init with no session header"
queue_response 0 200 \
  '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{}}}' \
  ""
queue_response 1 202 "" ""
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script init 2>&1 || true)"
assert_contains "$output" "No session ID received" "reports missing session ID"

# -------- Call --------

echo ""
echo "--- Call ---"

reset
echo ""
echo "Test: call auto-initializes when no session exists"
queue_init_ok "auto-sess"
queue_response 2 200 \
  '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"vault info here"}]}}' \
  "mcp-session-id: auto-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script call describe_vault 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "exits 0"
assert_contains "$output" "vault info here" "returns tool result"
assert_equals "auto-sess" "$(cat "$SESSION_FILE")" "session persisted"

reset
echo ""
echo "Test: call with existing session skips init"
echo "existing-sess" > "$SESSION_FILE"
echo "5" > "$REQID_FILE"
queue_response 0 200 \
  '{"jsonrpc":"2.0","id":6,"result":{"content":[{"type":"text","text":"note data"}]}}' \
  "mcp-session-id: existing-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script call read_note '{"path":"test.md"}' 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "exits 0"
assert_contains "$output" "note data" "returns note content"
assert_equals "6" "$(cat "$REQID_FILE")" "request ID incremented"

reset
echo ""
echo "Test: call with JSON args passes them through"
echo "sess" > "$SESSION_FILE"
queue_response 0 200 \
  '{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}' \
  "mcp-session-id: sess"
OBSIDIAN_MCP_TOKEN="tok" run_script call search_content '{"query":"TODO","folder":"Projects/"}' >/dev/null 2>&1
# Check the logged request body contains the tool name and args
logged="$(cat "$QUEUE_DIR/calls.log")"
assert_contains "$logged" "search_content" "request contains tool name"
assert_contains "$logged" "TODO" "request contains query arg"

reset
echo ""
echo "Test: call retries on session expiry (404)"
echo "stale-sess" > "$SESSION_FILE"
echo "1" > "$REQID_FILE"
# First call: 404 (session expired)
queue_response 0 404 ""
# Re-init: initialize + initialized
queue_init_ok_at 1 "fresh-sess"
# Retry call: success
queue_response 3 200 \
  '{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"recovered data"}]}}' \
  "mcp-session-id: fresh-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script call describe_vault 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "exits 0 after recovery"
assert_contains "$output" "recovered data" "returns result after retry"
assert_equals "fresh-sess" "$(cat "$SESSION_FILE")" "session updated"

reset
echo ""
echo "Test: call fails when retry also expires"
echo "stale" > "$SESSION_FILE"
# First call: 404
queue_response 0 404 ""
# Re-init: 404 again
queue_response 1 404 ""
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script call describe_vault 2>&1 || true)"
assert_contains "$output" "Failed to initialize session" "reports failure on double 404"

# -------- Tools --------

echo ""
echo "--- Tools ---"

reset
echo ""
echo "Test: tools command lists tools"
queue_init_ok "tools-sess"
queue_response 2 200 \
  '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"read_note","description":"Read a note"},{"name":"describe_vault","description":"Vault overview"}]}}' \
  "mcp-session-id: tools-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script tools 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "exits 0"
assert_contains "$output" "read_note" "lists read_note"
assert_contains "$output" "describe_vault" "lists describe_vault"
assert_contains "$output" "Vault overview" "shows tool description"

reset
echo ""
echo "Test: tools command retries on session expiry"
echo "old-sess" > "$SESSION_FILE"
# First call: 404
queue_response 0 404 ""
# Re-init
queue_init_ok_at 1 "new-tools-sess"
# Retry tools/list
queue_response 3 200 \
  '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"list_folder","description":"List files"}]}}' \
  "mcp-session-id: new-tools-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script tools 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "exits 0 after retry"
assert_contains "$output" "list_folder" "lists tools after retry"

# -------- Environment Variables --------

echo ""
echo "--- Environment ---"

reset
echo ""
echo "Test: default host and port in logged requests"
queue_init_ok "env-sess"
queue_response 2 200 '{"jsonrpc":"2.0","id":2,"result":{"content":[]}}' \
  "mcp-session-id: env-sess"
# Check that the patched script uses the right URL by inspecting the mock's behavior
# (The mock doesn't log the URL, but we verify the script runs successfully with defaults)
output="$(OBSIDIAN_MCP_TOKEN="tok" run_script call describe_vault 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "works with default host/port"

reset
echo ""
echo "Test: custom host and port accepted"
queue_init_ok "custom-sess"
output="$(OBSIDIAN_MCP_TOKEN="tok" OBSIDIAN_MCP_HOST="10.0.0.1" OBSIDIAN_MCP_PORT="9999" run_script init 2>&1)"
ec=$?
assert_exit_code 0 "$ec" "works with custom host/port"
assert_contains "$output" "Session initialized" "initializes with custom env"

# -------- Request ID --------

echo ""
echo "--- Request ID ---"

reset
echo ""
echo "Test: request ID starts at 1"
queue_init_ok "id-sess"
OBSIDIAN_MCP_TOKEN="tok" run_script init >/dev/null 2>&1
assert_equals "1" "$(cat "$REQID_FILE")" "ID starts at 1 after init"

reset
echo ""
echo "Test: request ID increments across calls"
echo "sess" > "$SESSION_FILE"
echo "3" > "$REQID_FILE"
queue_response 0 200 '{"jsonrpc":"2.0","id":4,"result":{"content":[]}}' \
  "mcp-session-id: sess"
OBSIDIAN_MCP_TOKEN="tok" run_script call describe_vault >/dev/null 2>&1
assert_equals "4" "$(cat "$REQID_FILE")" "ID incremented to 4"

# -------- Session Cleanup --------

echo ""
echo "--- Session Cleanup ---"

reset
echo ""
echo "Test: session file removed on 404"
echo "doomed" > "$SESSION_FILE"
queue_response 0 404 ""
# After 404, script tries re-init which also 404s
queue_response 1 404 ""
OBSIDIAN_MCP_TOKEN="tok" run_script call describe_vault 2>&1 || true
assert_file_not_exists "$SESSION_FILE" "session file cleaned up after 404"

reset
echo ""
echo "Test: init clears old session and reqid files"
echo "old-session" > "$SESSION_FILE"
echo "99" > "$REQID_FILE"
queue_init_ok "brand-new"
OBSIDIAN_MCP_TOKEN="tok" run_script init >/dev/null 2>&1
assert_equals "brand-new" "$(cat "$SESSION_FILE")" "session replaced"
assert_equals "1" "$(cat "$REQID_FILE")" "request ID reset to 1"

# -------- Protocol correctness --------

echo ""
echo "--- Protocol ---"

reset
echo ""
echo "Test: init sends correct JSON-RPC methods"
queue_init_ok "proto-sess"
OBSIDIAN_MCP_TOKEN="tok" run_script init >/dev/null 2>&1
# Flatten the calls log (jq pretty-prints across multiple lines)
calls="$(cat "$QUEUE_DIR/calls.log" | tr -d '\n ')"
assert_contains "$calls" '"method":"initialize"' "first call is initialize"
assert_contains "$calls" '"protocolVersion"' "includes protocol version"
assert_contains "$calls" '"openclaw-skill"' "includes client name"
assert_contains "$calls" 'notifications/initialized' "sends initialized notification"

reset
echo ""
echo "Test: call sends correct tools/call method"
echo "sess" > "$SESSION_FILE"
queue_response 0 200 '{"jsonrpc":"2.0","id":1,"result":{"content":[]}}' \
  "mcp-session-id: sess"
OBSIDIAN_MCP_TOKEN="tok" run_script call read_note '{"path":"x.md"}' >/dev/null 2>&1
call_body="$(cat "$QUEUE_DIR/calls.log" | tr -d '\n ')"
assert_contains "$call_body" '"method":"tools/call"' "uses tools/call method"
assert_contains "$call_body" '"name":"read_note"' "passes tool name"
assert_contains "$call_body" '"path":"x.md"' "passes tool arguments"

reset
echo ""
echo "Test: tools sends correct tools/list method"
echo "sess" > "$SESSION_FILE"
queue_response 0 200 \
  '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}' \
  "mcp-session-id: sess"
OBSIDIAN_MCP_TOKEN="tok" run_script tools >/dev/null 2>&1
call_body="$(cat "$QUEUE_DIR/calls.log" | tr -d '\n ')"
assert_contains "$call_body" '"method":"tools/list"' "uses tools/list method"

# ---------- summary ----------

echo ""
echo "==========================="
echo "Results: $PASSED passed, $FAILED failed, $TOTAL total"
echo "==========================="

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
