# AGENTNET — Docker (public deployment)
FROM node:22-alpine
WORKDIR /app
COPY . /app
EXPOSE 8721
# AGENTNET_GATEWAY must point to an OpenAI-compatible LLM endpoint reachable
# from the host (the phone-local free lane at 127.0.0.1:8100 is NOT reachable
# from a remote host).
ENV AGENTNET_PORT=8721
CMD ["node", "server.js"]
