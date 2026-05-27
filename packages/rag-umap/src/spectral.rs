//! Spectral embedding for UMAP initialization (Algorithm 4)

use crate::{FuzzySimplicialSet, Result, UmapError};
use ndarray::{Array1, Array2};

/// Compute spectral embedding for initialization using the graph Laplacian
pub fn spectral_layout(
    fuzzy_set: &FuzzySimplicialSet,
    n_components: usize,
) -> Result<Array2<f64>> {
    let n_vertices = fuzzy_set.n_vertices;

    if n_components >= n_vertices {
        return Err(UmapError::InvalidParameter(
            format!("n_components ({}) must be less than number of vertices ({})",
                    n_components, n_vertices)
        ));
    }

    // Use power iteration method for more robust eigenvalue computation
    power_iteration_spectral_layout(fuzzy_set, n_components, 50)
}

/// Convert fuzzy simplicial set to dense adjacency matrix
fn fuzzy_set_to_adjacency_matrix(fuzzy_set: &FuzzySimplicialSet) -> Array2<f64> {
    let n = fuzzy_set.n_vertices;
    let mut adjacency = Array2::zeros((n, n));

    for &(i, j, weight) in &fuzzy_set.edges {
        if i < n && j < n {
            adjacency[[i, j]] = weight;
        }
    }

    adjacency
}


/// Normalize the embedding to have reasonable scale
fn normalize_embedding(embedding: &mut Array2<f64>) {
    let (n_samples, n_components) = embedding.dim();

    // Center each dimension
    for j in 0..n_components {
        let mean = embedding.column(j).mean().unwrap_or(0.0);
        for i in 0..n_samples {
            embedding[[i, j]] -= mean;
        }
    }

    // Scale to have unit variance
    for j in 0..n_components {
        let column = embedding.column(j);
        let variance = column.mapv(|x| x * x).mean().unwrap_or(1.0);
        let std_dev = variance.sqrt();

        if std_dev > 1e-12 {
            for i in 0..n_samples {
                embedding[[i, j]] /= std_dev;
            }
        }
    }

    // Scale the overall embedding
    let scale = 10.0 / (n_components as f64).sqrt();
    for i in 0..n_samples {
        for j in 0..n_components {
            embedding[[i, j]] *= scale;
        }
    }
}

/// Simple alternative spectral layout using power iteration for large graphs
pub fn power_iteration_spectral_layout(
    fuzzy_set: &FuzzySimplicialSet,
    n_components: usize,
    max_iterations: usize,
) -> Result<Array2<f64>> {
    let n_vertices = fuzzy_set.n_vertices;

    if n_components >= n_vertices {
        return Err(UmapError::InvalidParameter(
            format!("n_components ({}) must be less than number of vertices ({})",
                    n_components, n_vertices)
        ));
    }

    // Convert to adjacency matrix
    let adjacency = fuzzy_set_to_adjacency_matrix(fuzzy_set);

    // Compute degree matrix
    let mut degrees: Array1<f64> = Array1::zeros(n_vertices);
    for i in 0..n_vertices {
        for j in 0..n_vertices {
            degrees[i] += adjacency[[i, j]];
        }
    }

    // Power iteration to find eigenvectors
    let mut embedding = Array2::zeros((n_vertices, n_components));

    for comp in 0..n_components {
        let mut vector = Array1::from_elem(n_vertices, 1.0 / (n_vertices as f64).sqrt());

        // Orthogonalize against previous eigenvectors
        for prev_comp in 0..comp {
            let dot_product: f64 = vector.iter()
                .zip(embedding.column(prev_comp).iter())
                .map(|(&v, &e)| v * e)
                .sum();

            for i in 0..n_vertices {
                vector[i] -= dot_product * embedding[[i, prev_comp]];
            }
        }

        // Normalize
        let norm = vector.mapv(|x| x * x).sum().sqrt();
        if norm > 1e-12 {
            vector /= norm;
        }

        // Power iteration
        for _iter in 0..max_iterations {
            let mut new_vector = Array1::zeros(n_vertices);

            // Apply (I - D^(-1/2) A D^(-1/2))
            for i in 0..n_vertices {
                new_vector[i] = vector[i]; // Identity part

                for j in 0..n_vertices {
                    if degrees[i] > 1e-12 && degrees[j] > 1e-12 {
                        let normalized_weight = adjacency[[i, j]] / (degrees[i] * degrees[j]).sqrt();
                        new_vector[i] -= normalized_weight * vector[j];
                    }
                }
            }

            // Orthogonalize against previous eigenvectors
            for prev_comp in 0..comp {
                let dot_product: f64 = new_vector.iter()
                    .zip(embedding.column(prev_comp).iter())
                    .map(|(&v, &e)| v * e)
                    .sum();

                for i in 0..n_vertices {
                    new_vector[i] -= dot_product * embedding[[i, prev_comp]];
                }
            }

            // Normalize
            let norm = new_vector.mapv(|x| x * x).sum().sqrt();
            if norm > 1e-12 {
                new_vector /= norm;
            }

            // Check convergence
            let diff: f64 = vector.iter()
                .zip(new_vector.iter())
                .map(|(&old, &new)| (old - new).abs())
                .sum();

            vector = new_vector;

            if diff < 1e-6 {
                break;
            }
        }

        // Store the computed eigenvector
        for i in 0..n_vertices {
            embedding[[i, comp]] = vector[i];
        }
    }

    // Normalize the embedding
    normalize_embedding(&mut embedding);

    Ok(embedding)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fuzzy_set_to_adjacency_matrix() {
        let mut fuzzy_set = FuzzySimplicialSet::new(3);
        fuzzy_set.add_edge(0, 1, 0.5);
        fuzzy_set.add_edge(1, 2, 0.8);

        let adjacency = fuzzy_set_to_adjacency_matrix(&fuzzy_set);

        assert_eq!(adjacency[[0, 1]], 0.5);
        assert_eq!(adjacency[[1, 2]], 0.8);
        assert_eq!(adjacency[[0, 2]], 0.0);
    }

    #[test]
    fn test_compute_normalized_laplacian() {
        // Simple 3x3 adjacency matrix
        let mut adjacency = Array2::zeros((3, 3));
        adjacency[[0, 1]] = 1.0;
        adjacency[[1, 0]] = 1.0;
        adjacency[[1, 2]] = 1.0;
        adjacency[[2, 1]] = 1.0;

        let laplacian = compute_normalized_laplacian(&adjacency).unwrap();

        // Check that the diagonal elements are 1
        assert!((laplacian[[0, 0]] - 1.0).abs() < 1e-10);
        assert!((laplacian[[1, 1]] - 1.0).abs() < 1e-10);
        assert!((laplacian[[2, 2]] - 1.0).abs() < 1e-10);

        // Check off-diagonal elements
        assert!(laplacian[[0, 1]] < 0.0); // Should be negative
        assert!(laplacian[[1, 2]] < 0.0); // Should be negative
    }

    #[test]
    fn test_normalize_embedding() {
        let mut embedding = Array2::from_shape_vec((3, 2), vec![
            1.0, 2.0,
            3.0, 4.0,
            5.0, 6.0,
        ]).unwrap();

        normalize_embedding(&mut embedding);

        // Check that each column has been centered (mean ≈ 0)
        let col0_mean = embedding.column(0).mean().unwrap();
        let col1_mean = embedding.column(1).mean().unwrap();

        assert!(col0_mean.abs() < 1e-10);
        assert!(col1_mean.abs() < 1e-10);
    }
}