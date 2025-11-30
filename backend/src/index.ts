import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { auth } from "./auth.js";
import usersRoute from "./routes/users.js";
import tagsRoute from "./routes/tags.js";
import issuesRoute from "./routes/issues.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  healthCheckHandler,
  readinessCheckHandler,
  livenessCheckHandler,
} from "./utils/health.js";

export async function buildApp(
  options = { skipAuth: false }
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  // Add skipAuth flag to app context for routes to check
  (fastify as any).skipAuth = options.skipAuth;

  // Register error handler first
  fastify.setErrorHandler(errorHandler);

  // Register CORS
  await fastify.register(cors, {
    origin: ["http://localhost:5173", "http://localhost:5174"], // Vite dev server
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "x-api-key"],
  });

  // Register BetterAuth routes with custom sign-up handling
  fastify.register(
    async function (fastify) {
      // Custom sign-up endpoint that creates API key after user creation
      fastify.post("/sign-up/email", async (request, reply) => {
        try {
          // First, create the user through Better Auth
          const authRequest = new Request(
            `http://localhost:3000/api/auth/sign-up/email`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify(request.body),
            }
          );

          const authResponse = await auth.handler(authRequest);
          const responseText = await authResponse.text();

          if (authResponse.ok) {
            // Parse the response to get user data
            const userData = JSON.parse(responseText);

            // Create API key for the new user
            try {
              const apiKeyResult = await auth.api.createApiKey({
                body: {
                  name: `${userData.user.name}'s API Key`,
                  userId: userData.user.id,
                  metadata: {
                    createdAt: new Date().toISOString(),
                    purpose: "default",
                  },
                },
              });

              console.log(
                `API key created for user ${userData.user.name}: ${apiKeyResult?.start || "created"}`
              );

              // Optionally include API key info in response (be careful with security)
              const enhancedResponse = {
                ...userData,
                apiKey: {
                  id: apiKeyResult.id,
                  name: apiKeyResult.name,
                  key: apiKeyResult.key, // Include the full API key for the user
                  start: apiKeyResult.start,
                  created: true,
                },
              };

              reply.status(authResponse.status);
              authResponse.headers.forEach((value, key) => {
                reply.header(key, value);
              });

              reply.send(enhancedResponse);
            } catch (error) {
              console.error(
                `Failed to create API key for user ${userData.user.name}:`,
                error
              );
              // Still return successful auth response even if API key creation fails
              reply.status(authResponse.status);
              authResponse.headers.forEach((value, key) => {
                reply.header(key, value);
              });
              reply.send(responseText);
            }
          } else {
            // Forward failed auth response as-is
            reply.status(authResponse.status);
            authResponse.headers.forEach((value, key) => {
              reply.header(key, value);
            });
            reply.send(responseText);
          }
        } catch (error) {
          console.error("Custom sign-up error:", error);
          reply.status(500).send({
            error: "Sign-up error",
            code: "SIGNUP_ERROR",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });

      // Custom endpoint to generate a new API key (invalidates existing ones)
      fastify.post("/generate-api-key", async (request, reply) => {
        try {
          // Get the session to verify user is authenticated
          const authRequest = new Request(
            `http://localhost:3000/api/auth/get-session`,
            {
              method: "GET",
              headers: {
                cookie: request.headers.cookie || "",
              },
            }
          );

          const sessionResponse = await auth.handler(authRequest);
          const sessionData = await sessionResponse.json();

          if (!sessionResponse.ok || !sessionData.user) {
            reply.status(401).send({
              error: "Unauthorized",
              code: "UNAUTHORIZED",
            });
            return;
          }

          const userId = sessionData.user.id;

          // First, get existing API keys for this user
          const existingKeys = await auth.api.listApiKeys({
            headers: {
              cookie: request.headers.cookie || "",
            },
          });

          // Delete all existing API keys for this user
          if (existingKeys && Array.isArray(existingKeys)) {
            for (const key of existingKeys) {
              try {
                await auth.api.deleteApiKey({
                  body: { keyId: key.id },
                  headers: {
                    cookie: request.headers.cookie || "",
                  },
                });
              } catch (deleteError) {
                console.error(
                  `Failed to delete API key ${key.id}:`,
                  deleteError
                );
              }
            }
          }

          // Create a new API key
          const apiKeyResult = await auth.api.createApiKey({
            body: {
              name: `${sessionData.user.name}'s API Key`,
              userId: userId,
              metadata: {
                createdAt: new Date().toISOString(),
                purpose: "regenerated",
              },
            },
          });

          console.log(
            `New API key generated for user ${sessionData.user.name}: ${apiKeyResult?.start || "created"}`
          );

          reply.send({
            success: true,
            apiKey: {
              id: apiKeyResult.id,
              name: apiKeyResult.name,
              key: apiKeyResult.key,
              start: apiKeyResult.start,
              created: true,
            },
          });
        } catch (error) {
          console.error("Generate API key error:", error);
          reply.status(500).send({
            error: "Failed to generate API key",
            code: "API_KEY_GENERATION_ERROR",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });

      // Handle all other auth routes normally
      fastify.all("/*", async (request, reply) => {
        try {
          // Construct the full URL
          const testUrl = `http://localhost:3000${request.url}`;

          // Convert Fastify headers to Headers object
          const headers = new Headers();
          Object.entries(request.headers).forEach(([key, value]) => {
            if (value) {
              const headerValue = Array.isArray(value) ? value[0] : value;
              if (typeof headerValue === "string") {
                headers.set(key, headerValue);
              }
            }
          });

          // Ensure content-type is set for POST requests
          if (request.method === "POST" && !headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }

          // Create the request object for BetterAuth
          const authRequest = new Request(testUrl, {
            method: request.method,
            headers: headers,
            body:
              request.method !== "GET" && request.method !== "HEAD"
                ? JSON.stringify(request.body)
                : null,
          });

          // Call BetterAuth handler
          const authResponse = await auth.handler(authRequest);

          // Get response text
          const responseText = await authResponse.text();

          // Set status
          reply.status(authResponse.status);

          // Copy all headers from auth response
          authResponse.headers.forEach((value, key) => {
            reply.header(key, value);
          });

          // Send response
          reply.send(responseText);
        } catch (error) {
          console.error("Auth error:", error);
          reply.status(500).send({
            error: "Authentication error",
            code: "AUTH_ERROR",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      });
    },
    { prefix: "/api/auth" }
  );

  // Test route
  fastify.get("/", async function handler(request, reply) {
    return { hello: "world" };
  });

  // Register API routes
  fastify.register(async function (fastify) {
    fastify.register(usersRoute, { prefix: "/api/users" });
    fastify.register(tagsRoute, { prefix: "/api/tags" });
    fastify.register(issuesRoute, { prefix: "/api/issues" });
  });

  // Health check endpoints (no rate limiting)
  fastify.get("/health", healthCheckHandler);
  fastify.get("/health/ready", readinessCheckHandler);
  fastify.get("/health/live", livenessCheckHandler);

  // Legacy health check for backward compatibility
  fastify.get("/api/health", async function handler(request, reply) {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  return fastify;
}

// Start the server if this file is run directly
if (import.meta.url.startsWith('file:')) {
  const modulePath = process.argv[1];
  if (!modulePath || modulePath.includes('index.ts') || modulePath.includes('index.js')) {
    try {
      const app = await buildApp();
      const port = Number(process.env.PORT) || 3000;
      const host = process.env.HOST || "0.0.0.0";
      await app.listen({ port, host });
      console.log(`🚀 Server ready at http://localhost:${port}`);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}
