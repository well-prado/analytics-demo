# Project Brief: Analytics Demo - Dynamic MCP SQL Interface

## Project Overview
The Analytics Demo is a sophisticated nanoservice-based application that transforms natural language queries into SQL database operations through MCP (Model Context Protocol) integration. The system bridges Claude Desktop with database analytics by providing dynamic, reusable workflow tools.

## Core Requirements
1. **Dynamic MCP Server**: Convert nanoservice nodes and workflows into MCP tools that Claude can invoke
2. **Natural Language to SQL**: Transform conversational queries into database operations 
3. **Company Analytics Mock**: Simulate departmental metrics for realistic business scenarios
4. **Zero Hardcoding**: All SQL, configurations, and logic must be dynamic and reusable
5. **Seamless Integration**: Claude Desktop should interact naturally with the system

## Primary Goals
- Create a dynamic alternative to the existing `db-manager.json` workflow
- Enable Claude to query company department metrics through natural language
- Eliminate all hardcoded SQL and static configurations
- Build reusable components for various database scenarios
- Maintain the existing MCP architecture while enhancing functionality

## Technical Constraints
- Must work with existing nanoservice infrastructure
- Preserve current MCP server functionality (`mcp-entry.ts`, `MCPRegistry.ts`)
- Use only necessary nodes without redundancy
- Support PostgreSQL database operations
- Integrate with OpenAI for query generation

## Success Criteria
- Claude can ask questions like "What are the sales metrics for Q4?" and get database results
- System works with any company data structure without code changes
- Workflow components are reusable across different database schemas
- No hardcoded SQL queries or database-specific logic
- Seamless MCP tool registration and execution 