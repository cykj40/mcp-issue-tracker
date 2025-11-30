import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import apiBasedTools from './api-based-tools.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new Server({
    name: 'issue-server',
    version: '1.0.0',
}, {
    capabilities: {
        resources: {},
        tools: {},
    }
});

apiBasedTools(server);

server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: 'schema://database',
                name: 'Database Schema',
                description: 'SQLite schema for the issues database',
                mimeType: 'text/plain',
            }
        ]
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === 'schema://database') {
        const dbPath = path.join(__dirname, '..', 'backend', 'database.sqlite');

        const schema = await new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

            db.all(
                "SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name",
                (err, rows) => {
                    db.close();
                    if (err) reject(err);
                    else resolve(rows.map((row) => row.sql + ';').join('\n\n'));
                }
            );
        });

        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: 'text/plain',
                    text: schema,
                }
            ]
        };
    }

    throw new Error('Unknown resource');
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Issue Tracker MCP Server running on stdio');
}

main().catch(console.error);