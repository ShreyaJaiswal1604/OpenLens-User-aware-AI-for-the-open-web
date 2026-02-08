import { PAGE_TOOLS } from './page-tools';
import type { McpTool } from '../modules/types';

// Ollama-compatible tool schema format (OpenAI function calling format)
export interface OllamaToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

// Built-in page tool parameter schemas
const TOOL_PARAM_SCHEMAS: Record<string, Record<string, { type: string; description: string }>> = {
  read_page: {
    max_tokens: { type: 'number', description: 'Maximum tokens to extract (default 2000)' },
  },
  extract_data: {
    data_type: { type: 'string', description: 'Type of data to extract: prices, links, forms, or headings' },
  },
  find_on_page: {
    query: { type: 'string', description: 'Text to search for on the page' },
  },
  navigate: {
    url: { type: 'string', description: 'URL to open in a new tab' },
  },
  fill_form: {
    fields: { type: 'string', description: 'JSON object of field name to value pairs' },
  },
  click_element: {
    selector: { type: 'string', description: 'CSS selector or visible text of the element to click' },
  },
};

export function getBuiltInToolSchemas(): OllamaToolSchema[] {
  return Object.values(PAGE_TOOLS).map((tool) => {
    const paramSchema = TOOL_PARAM_SCHEMAS[tool.name] || {};
    const required = tool.name === 'find_on_page' ? ['query']
      : tool.name === 'navigate' ? ['url']
      : tool.name === 'click_element' ? ['selector']
      : tool.name === 'fill_form' ? ['fields']
      : [];

    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties: paramSchema,
          required,
        },
      },
    };
  });
}

export function getMcpToolSchemas(mcpTools: McpTool[]): OllamaToolSchema[] {
  return mcpTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: `[${tool.serverName}] ${tool.description}`,
      parameters: {
        type: 'object' as const,
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    },
  }));
}

export function getAllToolSchemas(mcpTools: McpTool[]): OllamaToolSchema[] {
  return [...getBuiltInToolSchemas(), ...getMcpToolSchemas(mcpTools)];
}
