package handler

import (
	"net/http"
	"strconv"
	"time"

	"auto-novel/internal/domain"
	"auto-novel/internal/httpx"
	"auto-novel/internal/usecase"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/render"
)

type bannerHandler struct {
	bannerUsecase *usecase.BannerUsecase
}

func NewBannerHandler(bannerUsecase *usecase.BannerUsecase) *bannerHandler {
	return &bannerHandler{bannerUsecase: bannerUsecase}
}

func (h *bannerHandler) RegisterRoutes(router chi.Router) {
	router.Get("/", httpx.EH(h.listActive))
}

type bannerResponse struct {
	FocalX    float64           `json:"focalX"`
	FocalY    float64           `json:"focalY"`
	ID        int64             `json:"id"`
	Type      domain.BannerType `json:"type"`
	Key       string            `json:"key"`
	ImageURL  string            `json:"imageUrl"`
	LinkURL   *string           `json:"linkUrl"`
	SortOrder int32             `json:"sortOrder"`
	IsActive  bool              `json:"isActive"`
	CreatedAt time.Time         `json:"createdAt"`
	UpdatedAt time.Time         `json:"updatedAt"`
}

func newBannerResponse(banner usecase.BannerResult) bannerResponse {
	return bannerResponse{
		ID:        banner.ID,
		Type:      banner.Type,
		Key:       banner.Key,
		ImageURL:  banner.ImageURL,
		LinkURL:   banner.LinkURL,
		SortOrder: banner.SortOrder,
		FocalX:    banner.FocalX,
		FocalY:    banner.FocalY,
		IsActive:  banner.IsActive,
		CreatedAt: banner.CreatedAt,
		UpdatedAt: banner.UpdatedAt,
	}
}

func newBannerResponses(items []usecase.BannerResult) []bannerResponse {
	response := make([]bannerResponse, len(items))
	for i, item := range items {
		response[i] = newBannerResponse(item)
	}
	return response
}

func parseBannerQuery(r *http.Request) (usecase.ListBannersQuery, error) {
	value := r.URL.Query().Get("type")
	if value == "" {
		return usecase.ListBannersQuery{Type: domain.BannerTypeHome}, nil
	}
	bannerType, err := strconv.ParseInt(value, 10, 16)
	if err != nil {
		return usecase.ListBannersQuery{}, httpx.BadRequest("Banner 位置必须为整数")
	}
	return usecase.ListBannersQuery{Type: domain.BannerType(bannerType)}, nil
}

func (h *bannerHandler) listActive(w http.ResponseWriter, r *http.Request) error {
	query, err := parseBannerQuery(r)
	if err != nil {
		return err
	}
	items, err := h.bannerUsecase.ListActive(r.Context(), query)
	if err != nil {
		return transportError(err)
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	render.JSON(w, r, newBannerResponses(items))
	return nil
}
