import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export default function apiBasedTools(server) {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

    // Helper function to make HTTP requests
    async function makeRequest(method, url, data = null, options = {}) {
        const config = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        };

        const { headers: _, ...otherOptions } = options;
        Object.assign(config, otherOptions);

        if (data) {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, config);
            const result = await response.text();

            let jsonResult;
            try {
                jsonResult = JSON.parse(result);
            } catch {
                jsonResult = result;
            }
            return {
                status: response.status,
                data: jsonResult,
                headers: Object.fromEntries(response.headers.entries()),
            };
        } catch (error) {
            return {
                status: 0,
                error: error.message,
            };
        }
    }

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: 'issue-create',
                    description: 'Create a new issue in the issue tracker',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            title: {
                                type: 'string',
                                description: 'The title of the issue',
                            },
                            description: {
                                type: 'string',
                                description: 'The description of the issue',
                            },
                            status: {
                                type: 'string',
                                enum: ['not_started', 'in_progress', 'done'],
                                description: 'The status of the issue',
                            },
                            priority: {
                                type: 'string',
                                enum: ['low', 'medium', 'high', 'urgent'],
                                description: 'The priority of the issue',
                            },
                            assigned_user_id: {
                                type: 'string',
                                description: 'The ID of the user assigned to the issue',
                            },
                            tag_ids: {
                                type: 'array',
                                items: {
                                    type: 'number',
                                },
                                description: 'The IDs of the tags for the issue',
                            },
                            apiKey: {
                                type: 'string',
                                description: 'The API key for authentication',
                            },
                        },
                        required: ['title', 'apiKey'],
                    },
                },
            ],
        };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (name === 'issue-create') {
            const { apiKey, ...issueData } = args;
            const result = await makeRequest('POST', `${API_BASE_URL}/issues`, issueData, {
                headers: { 'x-api-key': apiKey },
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }

        throw new Error(`Unknown tool: ${name}`);
    });
}