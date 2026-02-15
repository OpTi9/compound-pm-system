FROM alpine:3.20

RUN apk add --no-cache bash coreutils

# The worker mounts the full filesystem of this image at /agent in the task container.
COPY agent/entrypoint.sh /agent/entrypoint.sh

RUN chmod +x /agent/entrypoint.sh

