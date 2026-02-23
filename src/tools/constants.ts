import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export const ACCESS_DENIED_MSG = 'Access denied or resource not found.';
export const MAX_SEARCH_RESULTS = 100;
export const MAX_APPEND_LENGTH = 50000;
export const MAX_EDIT_LENGTH = 100000;
export const MAX_CREATE_LENGTH = 100000;
export const MAX_CONTENT_SEARCH_RESULTS = 50;
export const MAX_SNIPPET_LENGTH = 200;
export const MAX_RECENT_NOTES = 50;
export const MAX_BACKLINKS = 50;
export const MAX_BACKLINK_CONTEXT_LENGTH = 200;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB base64 input limit
export const STATS_SAVE_DEBOUNCE_MS = 5000;

export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

export const WRITE_ANNOTATIONS: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};

export const WRITE_IDEMPOTENT_ANNOTATIONS: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

export const DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
