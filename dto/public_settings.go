package dto

// CustomMenuItem 自定义菜单项，对应前端 frontend/src/types/index.ts 的 CustomMenuItem
type CustomMenuItem struct {
	Id         string `json:"id"`
	Label      string `json:"label"`
	IconSvg    string `json:"icon_svg"`
	Url        string `json:"url"`
	Visibility string `json:"visibility"` // "user" / "admin"
	SortOrder  int    `json:"sort_order"`
}

// CustomEndpoint 自定义接入点，对应前端 CustomEndpoint
type CustomEndpoint struct {
	Name        string `json:"name"`
	Endpoint    string `json:"endpoint"`
	Description string `json:"description"`
}

// PublicSettings 星算前端公开配置，字段集合与
// frontend/src/types/index.ts 的 PublicSettings 一一对应（28 个键）。
type PublicSettings struct {
	RegistrationEnabled              bool             `json:"registration_enabled"`
	EmailVerifyEnabled               bool             `json:"email_verify_enabled"`
	RegistrationEmailSuffixWhitelist []string         `json:"registration_email_suffix_whitelist"`
	PromoCodeEnabled                 bool             `json:"promo_code_enabled"`
	PasswordResetEnabled             bool             `json:"password_reset_enabled"`
	InvitationCodeEnabled            bool             `json:"invitation_code_enabled"`
	TurnstileEnabled                 bool             `json:"turnstile_enabled"`
	TurnstileSiteKey                 string           `json:"turnstile_site_key"`
	SiteName                         string           `json:"site_name"`
	SiteLogo                         string           `json:"site_logo"`
	SiteSubtitle                     string           `json:"site_subtitle"`
	ApiBaseUrl                       string           `json:"api_base_url"`
	ContactInfo                      string           `json:"contact_info"`
	DocUrl                           string           `json:"doc_url"`
	HomeContent                      string           `json:"home_content"`
	HideCcsImportButton              bool             `json:"hide_ccs_import_button"`
	PurchaseSubscriptionEnabled      bool             `json:"purchase_subscription_enabled"`
	PurchaseSubscriptionUrl          string           `json:"purchase_subscription_url"`
	PaygEnabled                      bool             `json:"payg_enabled"`
	PaygExchangeRate                 float64          `json:"payg_exchange_rate"`
	PaygFixedAmountOptions           []float64        `json:"payg_fixed_amount_options"`
	CustomMenuItems                  []CustomMenuItem `json:"custom_menu_items"`
	CustomEndpoints                  []CustomEndpoint `json:"custom_endpoints"`
	LinuxdoOauthEnabled              bool             `json:"linuxdo_oauth_enabled"`
	BackendModeEnabled               bool             `json:"backend_mode_enabled"`
	Version                          string           `json:"version"`
	ChatProviderMode                 string           `json:"chat_provider_mode"`
	NewapiConsoleUrl                 string           `json:"newapi_console_url"`
}
