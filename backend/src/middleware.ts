import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "./auth.js";
import { getDatabase } from "./db/database.js";

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

function convertHeaders(requestHeaders: FastifyRequest["headers"]): Headers {
  const headers = new Headers();
  Object.entries(requestHeaders).forEach(([key, value]) => {
    if (value) {
      const headerValue = Array.isArray(value) ? value[0] : value;
      if (typeof headerValue === "string") {
        headers.append(key, headerValue);
      }
    }
  });
  return headers;
}

export async function authMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const headers = convertHeaders(request.headers);

    // Check for API key first (supports both x-api-key and authorization headers)
    const xApiKey = request.headers["x-api-key"];
    const apiKey =
      (typeof xApiKey === "string" ? xApiKey : null) ||
      (request.headers.authorization?.startsWith("Bearer ")
        ? request.headers.authorization.slice(7)
        : null);

    if (apiKey) {
      // Validate API key using BetterAuth
      const result = await auth.api.verifyApiKey({
        body: {
          key: apiKey,
        },
      });

      if (result?.valid && result?.key) {
        // Get user information from the database using the userId from the API key
        const db = await getDatabase();
        const user = await db.get(
          "SELECT id, email, name, emailVerified, image, createdAt, updatedAt FROM user WHERE id = ?",
          [result.key.userId]
        );
        await db.close();

        if (user) {
          request.user = {
            ...user,
            emailVerified: user.emailVerified === 1,
            image: user.image ?? null,
            createdAt: new Date(user.createdAt),
            updatedAt: new Date(user.updatedAt),
          };
          return; // Successfully authenticated with API key
        }
      }

      // API key was provided but invalid
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid API key",
      });
    }

    // Fall back to session-based authentication if no API key
    const session = await auth.api.getSession({
      headers: headers,
    });

    if (!session?.user) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    // Attach user to request
    request.user = {
      ...session.user,
      image: session.user.image ?? null,
    };
  } catch (error) {
    console.error("Auth middleware error:", error);
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Invalid authentication",
    });
  }
}

// Optional auth middleware (doesn't fail if no auth)
export async function optionalAuthMiddleware(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    const headers = convertHeaders(request.headers);

    // Get session from BetterAuth
    const session = await auth.api.getSession({
      headers: headers,
    });

    if (session?.user) {
      request.user = {
        ...session.user,
        image: session.user.image ?? null,
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    console.debug("Optional auth failed:", error);
  }
}
