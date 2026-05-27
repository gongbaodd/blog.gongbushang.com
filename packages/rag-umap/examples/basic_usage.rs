//! Basic UMAP usage example
//!
//! This example demonstrates how to use the simple convert_to_2d function
//! for dimensionality reduction on synthetic data.

use rag_umap::{convert_to_2d, convert_to_3d};
use std::f64::consts::PI;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("UMAP Basic Usage Example");
    println!("========================");

    // Create synthetic data - a 3D spiral
    let n_samples = 50;
    let data = generate_spiral_data(n_samples);

    println!("Generated {} samples in 3D space", n_samples);

    println!("\nStarting UMAP 2D conversion...");

    // Convert to 2D using the simple function
    let embedding_2d = convert_to_2d(data.clone())?;

    println!("UMAP 2D conversion completed!");
    println!("Original dimensions: {}x{}", data.len(), data[0].len());
    println!("Embedded dimensions: {}x{}", embedding_2d.len(), embedding_2d[0].len());

    // Print first few points of the embedding
    println!("\nFirst 10 embedded 2D points:");
    for i in 0..10.min(embedding_2d.len()) {
        println!("  Point {}: [{:.4}, {:.4}]",
                 i, embedding_2d[i][0], embedding_2d[i][1]);
    }

    // Convert to 3D using the simple function
    println!("\nStarting UMAP 3D conversion...");
    let embedding_3d = convert_to_3d(data.clone())?;

    println!("UMAP 3D conversion completed!");
    println!("3D embedded dimensions: {}x{}", embedding_3d.len(), embedding_3d[0].len());

    // Print first few points of the 3D embedding
    println!("\nFirst 5 embedded 3D points:");
    for i in 0..5.min(embedding_3d.len()) {
        println!("  Point {}: [{:.4}, {:.4}, {:.4}]",
                 i, embedding_3d[i][0], embedding_3d[i][1], embedding_3d[i][2]);
    }

    // Calculate some basic statistics for 2D
    let x_values: Vec<f64> = embedding_2d.iter().map(|p| p[0]).collect();
    let y_values: Vec<f64> = embedding_2d.iter().map(|p| p[1]).collect();

    let x_mean = x_values.iter().sum::<f64>() / x_values.len() as f64;
    let y_mean = y_values.iter().sum::<f64>() / y_values.len() as f64;

    let x_std = (x_values.iter().map(|x| (x - x_mean).powi(2)).sum::<f64>() / x_values.len() as f64).sqrt();
    let y_std = (y_values.iter().map(|y| (y - y_mean).powi(2)).sum::<f64>() / y_values.len() as f64).sqrt();

    println!("\n2D Embedding Statistics:");
    println!("  X: mean = {:.4}, std = {:.4}", x_mean, x_std);
    println!("  Y: mean = {:.4}, std = {:.4}", y_mean, y_std);

    println!("\nExample completed successfully!");

    Ok(())
}

/// Generate a 3D spiral dataset for testing
fn generate_spiral_data(n_samples: usize) -> Vec<Vec<f64>> {
    let mut data = Vec::new();

    for i in 0..n_samples {
        let t = i as f64 / n_samples as f64 * 4.0 * PI;
        let radius = t / (4.0 * PI);

        let point = vec![
            radius * t.cos(),
            radius * t.sin(),
            t / (2.0 * PI),
        ];
        data.push(point);
    }

    data
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spiral_data_generation() {
        let data = generate_spiral_data(100);
        assert_eq!(data.len(), 100);
        assert_eq!(data[0].len(), 3);

        // Check that data varies (not all zeros)
        let sum: f64 = data.iter().flatten().map(|&x| x.abs()).sum();
        assert!(sum > 0.0);
    }

    #[test]
    fn test_convert_to_2d_integration() {
        // Create small test dataset
        let data = generate_spiral_data(50);

        let embedding = convert_to_2d(data).unwrap();

        // Check output dimensions
        assert_eq!(embedding.len(), 50);
        assert_eq!(embedding[0].len(), 2);

        // Check that embedding is not all zeros or NaN
        let finite_count = embedding.iter().flatten().filter(|&&x| x.is_finite()).count();
        assert_eq!(finite_count, 100); // 50 points * 2 dimensions
    }

    #[test]
    fn test_convert_to_3d_integration() {
        // Create small test dataset
        let data = generate_spiral_data(30);

        let embedding = convert_to_3d(data).unwrap();

        // Check output dimensions
        assert_eq!(embedding.len(), 30);
        assert_eq!(embedding[0].len(), 3);

        // Check that embedding is not all zeros or NaN
        let finite_count = embedding.iter().flatten().filter(|&&x| x.is_finite()).count();
        assert_eq!(finite_count, 90); // 30 points * 3 dimensions
    }
}