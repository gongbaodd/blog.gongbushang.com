//! UMAP dimensionality reduction for post embedding vectors.

use rag_umap::{convert_to_2d_with_config, Umap2dConfig};

/// Keep in sync with `UMAP_2D_CONFIG` in `packages/content-prepare/src/umap-params.ts`.
const UMAP_2D_CONFIG: Umap2dConfig = Umap2dConfig {
    n_neighbors: 20,  
    min_dist: 0.01, 
    spread: 1.0,
};

/// Reduce high-dimensional embeddings to 2D coordinates using UMAP.
pub fn umap_2d(embeddings: &[Vec<f64>]) -> Result<Vec<[f64; 2]>, String> {
    if embeddings.is_empty() {
        return Err("embeddings must not be empty".into());
    }

    if embeddings.len() < 2 {
        return Err("UMAP requires at least 2 embeddings".into());
    }

    let dimension = embeddings[0].len();
    if dimension == 0 {
        return Err("embedding vectors must not be empty".into());
    }

    for (index, row) in embeddings.iter().enumerate() {
        if row.len() != dimension {
            return Err(format!(
                "embedding row {index} has length {} but expected {dimension}",
                row.len()
            ));
        }
    }

    let result = convert_to_2d_with_config(embeddings.to_vec(), UMAP_2D_CONFIG)
        .map_err(|error| error.to_string())?;

    let coordinates: Vec<[f64; 2]> = result
        .into_iter()
        .map(|row| {
            if row.len() != 2 {
                return Err(format!("expected 2D coordinate, got {} values", row.len()));
            }
            let x = row[0];
            let y = row[1];
            if !x.is_finite() || !y.is_finite() {
                return Err("UMAP produced non-finite coordinates".into());
            }
            Ok([x, y])
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(coordinates)
}

#[cfg(test)]
mod tests {
    use super::umap_2d;

    fn synthetic_matrix() -> Vec<Vec<f64>> {
        vec![
            vec![0.0, 0.0, 0.0],
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
            vec![1.0, 1.0, 0.0],
        ]
    }

    #[test]
    fn rejects_empty_input() {
        let error = umap_2d(&[]).unwrap_err();
        assert!(error.contains("empty"));
    }

    #[test]
    fn rejects_single_row() {
        let error = umap_2d(&[vec![1.0, 2.0, 3.0]]).unwrap_err();
        assert!(error.contains("at least 2"));
    }

    #[test]
    fn rejects_ragged_rows() {
        let error = umap_2d(&[vec![1.0, 2.0], vec![3.0]]).unwrap_err();
        assert!(error.contains("row 1"));
    }

    #[test]
    fn returns_four_2d_coordinates_for_synthetic_matrix() {
        let coordinates = umap_2d(&synthetic_matrix()).expect("valid matrix");
        assert_eq!(coordinates.len(), 4);
        for [x, y] in coordinates {
            assert!(x.is_finite());
            assert!(y.is_finite());
        }
    }
}
