FROM gradle:8-jdk17 AS builder
USER root
WORKDIR /server
COPY server/ ./
RUN --mount=type=cache,id=auto-novel-gradle,target=/root/.gradle \
    gradle --no-daemon installDist

FROM eclipse-temurin:17-jre
COPY --from=builder /server/build/install/auto-novel-server /server
ENV LANG=C.UTF-8
CMD ["/server/bin/auto-novel-server"]
