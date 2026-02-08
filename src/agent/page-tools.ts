import type { PermissionType } from '../modules/types';

export interface ToolResult {
  success: boolean;
  data: unknown;
  tokensUsed: number;
  origin: string;
  sensitivity: 'low' | 'medium' | 'high';
  summary: string;
}

export interface PageTool {
  name: string;
  description: string;
  requiredPermission: PermissionType;
  isWriteAction: boolean;
  params?: Record<string, string>;
}

export const PAGE_TOOLS: Record<string, PageTool> = {
  read_page: {
    name: 'read_page',
    description: 'Extract and summarize the current page content',
    requiredPermission: 'page_read',
    isWriteAction: false,
  },
  extract_data: {
    name: 'extract_data',
    description: 'Extract structured data (prices, links, forms, headings) from the page',
    requiredPermission: 'page_read',
    isWriteAction: false,
  },
  find_on_page: {
    name: 'find_on_page',
    description: 'Search for specific text on the page',
    requiredPermission: 'page_read',
    isWriteAction: false,
    params: { query: 'Text to search for' },
  },
  navigate: {
    name: 'navigate',
    description: 'Open a URL in a new tab',
    requiredPermission: 'page_action',
    isWriteAction: true,
    params: { url: 'URL to open' },
  },
  fill_form: {
    name: 'fill_form',
    description: 'Fill form fields (user must submit manually)',
    requiredPermission: 'page_action',
    isWriteAction: true,
    params: { fields: 'Object of field name → value pairs' },
  },
  click_element: {
    name: 'click_element',
    description: 'Click a link or button by selector or text',
    requiredPermission: 'page_action',
    isWriteAction: true,
    params: { selector: 'CSS selector or text content to match' },
  },
};

export function getToolDef(toolName: string): PageTool | null {
  return PAGE_TOOLS[toolName] || null;
}
