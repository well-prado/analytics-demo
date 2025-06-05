/**
 * Types for the Model Context Protocol (MCP) implementation
 */

/**
 * MCPRequestContext represents the context information for an MCP request
 * This is used in the StatelessMCPNode as part of the InputType
 */
export interface MCPRequestContext {
    /** The MCP operation being requested */
    operation?: string;
  
    /** HTTP method (GET, POST, etc.) */
    method?: string;
  
    /** Request body data */
    body?: Record<string, any>;
  
    /** Request parameters */
    params?: Record<string, any>;
  
    /** Query parameters */
    query?: Record<string, any>;
  
    /** HTTP headers */
    headers?: Record<string, any>;
  
    /** Optional client information */
    client?: {
      id?: string;
      name?: string;
      version?: string;
    };
  }
  