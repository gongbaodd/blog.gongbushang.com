use serde::{Deserialize, Serialize};
use std::io::{self, Read};
use umap::{umap_2d, Umap2dConfig};

#[derive(Debug, Deserialize)]
struct Config {
    n_neighbors: usize,
    min_dist: f64,
    spread: f64,
}

impl From<Config> for Umap2dConfig {
    fn from(value: Config) -> Self {
        Self {
            n_neighbors: value.n_neighbors,
            min_dist: value.min_dist,
            spread: value.spread,
        }
    }
}

#[derive(Debug, Deserialize)]
struct Input {
    embeddings: Vec<Vec<f64>>,
    config: Config,
}

#[derive(Debug, Serialize)]
struct Output {
    coordinates: Vec<[f64; 2]>,
}

fn main() {
    if let Err(message) = run() {
        eprintln!("{message}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("failed to read stdin: {error}"))?;

    let payload: Input =
        serde_json::from_str(&input).map_err(|error| format!("invalid JSON input: {error}"))?;

    let coordinates = umap_2d(&payload.embeddings, payload.config.into())?;

    let output = Output { coordinates };
    let json = serde_json::to_string(&output)
        .map_err(|error| format!("failed to serialize output: {error}"))?;
    println!("{json}");
    Ok(())
}
