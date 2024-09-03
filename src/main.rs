use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::Html;
use axum::response::{IntoResponse, Response};
use axum::{
    extract::Path,
    routing::{get, post},
    Json, Router,
};
use once_cell::sync::Lazy;
use redis::{Client, Commands};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

const VOTE_THRESHOLD: u32 = 5;

#[derive(Deserialize, Serialize)]
struct TweetId {
    id: String,
}

struct AppState {
    redis_client: Client,
}

#[derive(RustEmbed)]
#[folder = "static/"]
struct Asset;

#[derive(Error, Debug)]
enum AppError {
    #[error("Redis error: {0}")]
    RedisError(#[from] redis::RedisError),
    #[error("Environment variable error: {0}")]
    EnvVarError(#[from] std::env::VarError),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Asset not found: {0}")]
    AssetNotFound(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::RedisError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Redis error"),
            AppError::EnvVarError(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Environment variable error",
            ),
            AppError::IoError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "IO error"),
            AppError::AssetNotFound(_) => (StatusCode::NOT_FOUND, "Asset not found"),
        };

        (status, error_message).into_response()
    }
}

static CACHED_INDEX: Lazy<Result<String, AppError>> = Lazy::new(|| {
    Asset::get("index-mini.html")
        .ok_or_else(|| AppError::AssetNotFound("index-mini.html".to_string()))
        .map(|index_html| String::from_utf8_lossy(index_html.data.as_ref()).to_string())
});

static CACHED_PRIVACY_POLICY: Lazy<Result<String, AppError>> = Lazy::new(|| {
    Asset::get("privacy-policy.html")
        .ok_or_else(|| AppError::AssetNotFound("privacy-policy-mini.html".to_string()))
        .map(|privacy_policy_html| {
            String::from_utf8_lossy(privacy_policy_html.data.as_ref()).to_string()
        })
});

#[tokio::main]
async fn main() -> Result<(), AppError> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = Client::open(redis_url)?;
    let state = Arc::new(Mutex::new(AppState { redis_client }));
    let cors = CorsLayer::new()
        .allow_origin([
            "chrome-extension://pfodojlcgdhedjakbpaomhdogfgkeedj"
                .parse::<HeaderValue>()
                .unwrap(),
            "chrome-extension://lbcghcijpkdbbbdlcdcgblmbbajoeigb"
                .parse::<HeaderValue>()
                .unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let api_routes = Router::new()
        .route("/tweet/:id", get(check_tweet))
        .route("/tweet", post(add_tweet))
        .route("/health", get(health_check))
        .with_state(state.clone());

    let app = Router::new()
        .nest("/api", api_routes)
        .route("/", get(serve_index))
        .route("/privacy-policy", get(serve_privacy_policy))
        .layer(cors);

    println!("Server listening on port 3000");
    axum::serve(tokio::net::TcpListener::bind("0.0.0.0:3000").await?, app).await?;

    Ok(())
}

async fn check_tweet(
    Path(id): Path<String>,
    state: axum::extract::State<Arc<Mutex<AppState>>>,
) -> Result<Json<bool>, AppError> {
    println!("Check id {}", id);
    let state = state.lock().await;
    let mut con = state.redis_client.get_connection()?;
    let votes: Option<u32> = con.get(&id)?;
    Ok(Json(votes.unwrap_or(0) > VOTE_THRESHOLD))
}

async fn add_tweet(
    state: axum::extract::State<Arc<Mutex<AppState>>>,
    Json(tweet): Json<TweetId>,
) -> Result<Json<bool>, AppError> {
    let state = state.lock().await;
    let mut con = state.redis_client.get_connection()?;
    let votes: u32 = con.incr(&tweet.id, 1)?;
    con.expire(&tweet.id, 60 * 60 * 24 * 7)?;
    Ok(Json(votes > VOTE_THRESHOLD))
}

async fn health_check() -> StatusCode {
    StatusCode::OK
}

async fn serve_index() -> Result<Html<String>, AppError> {
    Ok(Html(
        CACHED_INDEX
            .as_ref()
            .map_err(|e| AppError::AssetNotFound(e.to_string()))?
            .clone(),
    ))
}

async fn serve_privacy_policy() -> Result<Html<String>, AppError> {
    Ok(Html(
        CACHED_PRIVACY_POLICY
            .as_ref()
            .map_err(|e| AppError::AssetNotFound(e.to_string()))?
            .clone(),
    ))
}
