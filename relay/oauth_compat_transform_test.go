package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	claudechannel "github.com/QuantumNous/new-api/relay/channel/claude"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// TestCompatOpenAIToClaudeOAuthOutboundBody pins the end body the /pg
// (chat-completions) path sends for an OAuth subscription channel: the
// chat-completions request converted by the claude-channel adaptor, then run
// through ApplyClaudeOAuthTransform — the exact composition TextHelper performs.
func TestCompatOpenAIToClaudeOAuthOutboundBody(t *testing.T) {
	req := &dto.GeneralOpenAIRequest{
		Model:       "claude-sonnet-4-5",
		Temperature: common.GetPointer(0.7),
		Messages: []dto.Message{
			{Role: "user", Content: "hello"},
		},
	}

	adaptor := &claudechannel.Adaptor{}
	converted, err := adaptor.ConvertOpenAIRequest(nil, nil, req)
	require.NoError(t, err)
	jsonData, err := common.Marshal(converted)
	require.NoError(t, err)

	// Pre-transform = the body a non-OAuth (apikey) channel sends: no banner, no
	// injected metadata, temperature preserved (TextHelper gates on info.IsOAuth).
	require.NotEqual(t, claudechannel.ClaudeCodeSystemPrompt, gjson.GetBytes(jsonData, "system.0.text").String())
	require.False(t, gjson.GetBytes(jsonData, "metadata").Exists())
	require.True(t, gjson.GetBytes(jsonData, "temperature").Exists())

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelId: 42,
			IsOAuth:   true,
			ApiKey:    `{"access_token":"sk-ant-test","refresh_token":"rt-test","expires_at":4102444800,"account_uuid":"acct-uuid-test"}`,
		},
	}
	out := ApplyClaudeOAuthTransform(info, jsonData)

	// Banner is the first system block; its cache_control is stripped afterwards
	// (faithful to sub2api — see oauth_transform_test.go).
	require.Equal(t, claudechannel.ClaudeCodeSystemPrompt, gjson.GetBytes(out, "system.0.text").String())
	require.False(t, gjson.GetBytes(out, "system.0.cache_control").Exists())
	// Model normalized short -> long.
	require.Equal(t, "claude-sonnet-4-5-20250929", gjson.GetBytes(out, "model").String())
	// tools[] ensured even when the client sent none.
	require.True(t, gjson.GetBytes(out, "tools").Exists())
	// temperature is dropped on the OAuth path.
	require.False(t, gjson.GetBytes(out, "temperature").Exists())
	// A stable metadata.user_id is injected when the client sent none.
	require.NotEmpty(t, gjson.GetBytes(out, "metadata.user_id").String())

	// Byte-idempotent: the relay retry loop may re-apply the transform.
	out2 := ApplyClaudeOAuthTransform(info, out)
	require.Equal(t, string(out), string(out2))
}
