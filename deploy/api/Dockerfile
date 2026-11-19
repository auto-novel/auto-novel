FROM golang:1.27.3-alpine3.24 AS deps
WORKDIR /app
COPY apps/api/go.mod apps/api/go.sum ./
RUN --mount=type=cache,id=go-mod,target=/go/pkg/mod \
    go mod download

FROM deps AS builder
WORKDIR /app
COPY apps/api/. .
RUN go build -o api

FROM alpine:3.24.2
WORKDIR /app
COPY --from=builder /app/api /app/api
EXPOSE 8101
CMD ["./api"]
