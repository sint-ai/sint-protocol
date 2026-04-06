use thiserror::Error;

#[derive(Error, Debug)]
pub enum SintError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Gateway error ({status}): {message}")]
    Gateway { status: u16, message: String },
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Invalid configuration: {0}")]
    Config(String),
}

pub type Result<T> = std::result::Result<T, SintError>;
