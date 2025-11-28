import { MCP } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const server = new MCP({
    name: 'issue-server',
    version: '1.0.0',
});


server.registerResource(
    title: "Database Schema",
)