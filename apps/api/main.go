package main

import (
	"log/slog"
	"net/http"
	"os"
	"strconv"

	"auto-novel/internal/handler"
	"auto-novel/internal/httpx"
	"auto-novel/internal/infra"
	"auto-novel/internal/repository"
	"auto-novel/internal/usecase"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httplog/v3"
)

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(env(key, ""))
	if err != nil {
		return fallback
	}
	return value
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	httpx.AccessTokenSecret = os.Getenv("ACCESS_TOKEN_SECRET")
	if httpx.AccessTokenSecret == "" {
		slog.Error("ACCESS_TOKEN_SECRET is required")
		os.Exit(1)
	}

	db, err := infra.NewSQLDB(
		env("DB_HOST", "localhost"),
		envInt("DB_PORT", 5432),
		env("DB_USER", "auto-novel"),
		env("DB_PASSWORD", ""),
		env("DB_NAME", "auto-novel"),
	)
	if err != nil {
		slog.Error("Configure database failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	s3Client, err := infra.NewR2Client(infra.R2Config{
		AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
	})
	if err != nil {
		slog.Error("Configure R2 failed", "error", err)
		os.Exit(1)
	}
	objectRepo, err := repository.NewObjectRepository(
		s3Client, os.Getenv("R2_BUCKET"), os.Getenv("R2_PUBLIC_BASE_URL"),
	)
	if err != nil {
		slog.Error("Configure object repository failed", "error", err)
		os.Exit(1)
	}
	bannerRepo := repository.NewBannerRepository(db)
	bannerUsecase := usecase.NewBannerUsecase(bannerRepo, objectRepo)
	bannerHandler := handler.NewBannerHandler(bannerUsecase)

	router := chi.NewRouter()
	router.Use(middleware.Recoverer)

	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK\n"))
	})
	router.Route("/v1", func(router chi.Router) {
		router.Use(httplog.RequestLogger(slog.Default(), &httplog.Options{
			Level:         slog.LevelInfo,
			Schema:        httplog.SchemaECS,
			RecoverPanics: true,
		}))
		router.Use(httpx.OptionalAccessToken)
		router.Route("/banner", bannerHandler.RegisterRoutes)
		router.Route("/admin", func(router chi.Router) {
			router.Use(httpx.RequireAdmin)
			router.Route("/banner", bannerHandler.RegisterAdminRoutes)
		})
	})

	slog.Info("Listening on localhost:8101...")
	if err := http.ListenAndServe(":8101", router); err != nil {
		slog.Error("HTTP server failed", "error", err)
		os.Exit(1)
	}
}
