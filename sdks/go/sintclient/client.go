package sintclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

func New(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		HTTP:    &http.Client{},
	}
}

func (c *Client) do(method, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		buf, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewBuffer(buf)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("x-api-key", c.APIKey)
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		b, _ := io.ReadAll(res.Body)
		return fmt.Errorf("sint gateway error (%d): %s", res.StatusCode, string(b))
	}

	if out == nil {
		_, _ = io.Copy(io.Discard, res.Body)
		return nil
	}

	return json.NewDecoder(res.Body).Decode(out)
}

func (c *Client) Discovery(out any) error {
	return c.do(http.MethodGet, "/.well-known/sint.json", nil, out)
}

func (c *Client) Health(out any) error {
	return c.do(http.MethodGet, "/v1/health", nil, out)
}

func (c *Client) IssueToken(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/tokens", req, out)
}

func (c *Client) RevokeToken(tokenID, reason, by string, out any) error {
	payload := map[string]any{"tokenId": tokenID, "reason": reason, "by": by}
	return c.do(http.MethodPost, "/v1/tokens/revoke", payload, out)
}

func (c *Client) Intercept(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/intercept", req, out)
}

func (c *Client) InterceptBatch(req map[string]any, out any) error {
	return c.do(http.MethodPost, "/v1/intercept/batch", req, out)
}

func (c *Client) ApprovalsPending(out any) error {
	return c.do(http.MethodGet, "/v1/approvals/pending", nil, out)
}

func (c *Client) ResolveApproval(requestID, status, by, reason string, out any) error {
	payload := map[string]any{"status": status, "by": by}
	if reason != "" {
		payload["reason"] = reason
	}
	return c.do(http.MethodPost, "/v1/approvals/"+requestID+"/resolve", payload, out)
}
