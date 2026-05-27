//! High-dimensional UMAP example
//!
//! This example demonstrates the simple convert functions on high-dimensional data,
//! which is one of UMAP's primary use cases.

use rag_umap::{convert_to_2d, convert_to_3d};
use rand::{Rng, SeedableRng};
use std::f64::consts::PI;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("UMAP High-Dimensional Data Example");
    println!("==================================");

    // Test different dimensionalities
    test_high_dimensional_data(100, 100)?;   // 100D -> 2D
    test_high_dimensional_data(500, 200)?;   // 500D -> 2D
    test_high_dimensional_data(1000, 300)?;  // 1000D -> 2D

    // Test embedding to different target dimensions
    test_different_target_dimensions()?;

    println!("\nAll high-dimensional tests completed successfully!");
    Ok(())
}

fn test_high_dimensional_data(n_dims: usize, n_samples: usize) -> Result<(), Box<dyn std::error::Error>> {
    println!("\n--- Testing {}D data with {} samples ---", n_dims, n_samples);

    // Generate high-dimensional data with some structure
    let data = generate_structured_high_dim_data(n_samples, n_dims);

    println!("Generated data shape: {}x{}", data.len(), data[0].len());

    println!("Starting UMAP 2D conversion...");
    let start_time = std::time::Instant::now();

    let embedding = convert_to_2d(data)?;

    let duration = start_time.elapsed();
    println!("UMAP completed in {:.2?}", duration);

    println!("Output embedding shape: {}x{}", embedding.len(), embedding[0].len());

    // Calculate some statistics about the embedding
    let x_values: Vec<f64> = embedding.iter().map(|p| p[0]).collect();
    let y_values: Vec<f64> = embedding.iter().map(|p| p[1]).collect();

    let x_mean = x_values.iter().sum::<f64>() / x_values.len() as f64;
    let y_mean = y_values.iter().sum::<f64>() / y_values.len() as f64;
    let x_std = (x_values.iter().map(|x| (x - x_mean).powi(2)).sum::<f64>() / x_values.len() as f64).sqrt();
    let y_std = (y_values.iter().map(|y| (y - y_mean).powi(2)).sum::<f64>() / y_values.len() as f64).sqrt();

    println!("Embedding statistics:");
    println!("  X: mean = {:.4}, std = {:.4}", x_mean, x_std);
    println!("  Y: mean = {:.4}, std = {:.4}", y_mean, y_std);

    // Check that the embedding spread is reasonable
    let x_range = x_values.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b))
                - x_values.iter().fold(f64::INFINITY, |a, &b| a.min(b));
    let y_range = y_values.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b))
                - y_values.iter().fold(f64::INFINITY, |a, &b| a.min(b));

    println!("  Range: X = {:.4}, Y = {:.4}", x_range, y_range);

    Ok(())
}

fn test_different_target_dimensions() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n--- Testing Different Target Dimensions ---");

    let data = generate_structured_high_dim_data(100, 50);

    // Test 2D embedding
    println!("\nEmbedding 50D data to 2D:");
    let embedding_2d = convert_to_2d(data.clone())?;
    println!("  Success! Shape: {}x{}", embedding_2d.len(), embedding_2d[0].len());

    // Verify no NaN or infinite values
    let finite_count_2d = embedding_2d.iter().flatten().filter(|&&x| x.is_finite()).count();
    let total_count_2d = embedding_2d.len() * embedding_2d[0].len();
    println!("  Finite values: {}/{} ({:.1}%)",
             finite_count_2d, total_count_2d,
             (finite_count_2d as f64 / total_count_2d as f64) * 100.0);

    // Test 3D embedding
    println!("\nEmbedding 50D data to 3D:");
    let embedding_3d = convert_to_3d(data)?;
    println!("  Success! Shape: {}x{}", embedding_3d.len(), embedding_3d[0].len());

    // Verify no NaN or infinite values
    let finite_count_3d = embedding_3d.iter().flatten().filter(|&&x| x.is_finite()).count();
    let total_count_3d = embedding_3d.len() * embedding_3d[0].len();
    println!("  Finite values: {}/{} ({:.1}%)",
             finite_count_3d, total_count_3d,
             (finite_count_3d as f64 / total_count_3d as f64) * 100.0);

    Ok(())
}

/// Generate structured high-dimensional data
/// Creates data with some underlying structure to make UMAP meaningful
fn generate_structured_high_dim_data(n_samples: usize, n_dims: usize) -> Vec<Vec<f64>> {
    let mut rng = rand::rngs::StdRng::seed_from_u64(42);
    let mut data = Vec::new();

    for i in 0..n_samples {
        let mut point = Vec::new();

        // Create structured data with clusters and gradients
        let cluster_id = i % 5;  // 5 clusters
        let t = i as f64 / n_samples as f64;

        for j in 0..n_dims {
            let base_value = match cluster_id {
                0 => 1.0 * (j as f64 / n_dims as f64).cos(),
                1 => 2.0 * (j as f64 / n_dims as f64).sin(),
                2 => 0.5 * (j as f64 * t).exp().min(5.0),
                3 => (j as f64 + t * 10.0).cos(),
                _ => t * (j as f64 / n_dims as f64),
            };

            // Add some noise
            let noise = rng.gen_range(-0.1..0.1);
            point.push(base_value + noise);
        }

        data.push(point);
    }

    data
}

/// Generate random high-dimensional data (for stress testing)
fn generate_random_high_dim_data(n_samples: usize, n_dims: usize) -> Vec<Vec<f64>> {
    let mut rng = rand::rngs::StdRng::seed_from_u64(42);
    let mut data = Vec::new();

    for _i in 0..n_samples {
        let mut point = Vec::new();
        for _j in 0..n_dims {
            point.push(rng.gen_range(-1.0..1.0));
        }
        data.push(point);
    }

    data
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_very_high_dimensional_data() {
        // Test with 200D data
        let data = generate_structured_high_dim_data(50, 200);
        assert_eq!(data.len(), 50);
        assert_eq!(data[0].len(), 200);

        let embedding = convert_to_2d(data).unwrap();
        assert_eq!(embedding.len(), 50);
        assert_eq!(embedding[0].len(), 2);

        // Check that embedding is not degenerate
        let x_values: Vec<f64> = embedding.iter().map(|p| p[0]).collect();
        let x_range = x_values.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b))
                    - x_values.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        assert!(x_range > 0.001, "X dimension should have some spread");
    }

    #[test]
    fn test_embedding_to_3d() {
        let data = generate_structured_high_dim_data(30, 20);

        // Test embedding to 3D
        let embedding = convert_to_3d(data).unwrap();
        assert_eq!(embedding.len(), 30);
        assert_eq!(embedding[0].len(), 3);
    }

    #[test]
    fn test_performance_with_different_sizes() {
        // Test that UMAP handles various data sizes reasonably
        let test_cases = vec![
            (20, 10),   // Small data
            (100, 50),  // Medium data
            (200, 100), // Larger data
        ];

        for (n_samples, n_dims) in test_cases {
            let data = generate_structured_high_dim_data(n_samples, n_dims);

            let start = std::time::Instant::now();
            let embedding = convert_to_2d(data).unwrap();
            let duration = start.elapsed();

            assert_eq!(embedding.len(), n_samples);
            assert_eq!(embedding[0].len(), 2);
            println!("{}x{} data took {:?}", n_samples, n_dims, duration);
        }
    }
}