use serde::{Deserialize, Serialize};
use std::io::{self, Read};
use umap::umap_2d;

#[derive(Debug, Deserialize)]
struct Input {
    embeddings: Vec<Vec<f64>>,
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

    let coordinates = umap_2d(&payload.embeddings)?;

    let output = Output { coordinates };
    let json = serde_json::to_string(&output)
        .map_err(|error| format!("failed to serialize output: {error}"))?;
    println!("{json}");
    Ok(())
}
