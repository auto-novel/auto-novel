FROM gradle:8-jdk17 AS builder
COPY . /server
WORKDIR /server
RUN gradle --no-daemon installDist

FROM eclipse-temurin:17.0.10_7-jdk
COPY --from=builder /server/build/install/auto-novel-server /server
ENV LANG C.UTF-8
CMD ["/server/bin/auto-novel-server"]
