//! Stochastic Gradient Descent optimization for UMAP (Algorithm 5)

use crate::{FuzzySimplicialSet, Result, UmapError};
use ndarray::{Array2, ArrayViewMut2};
use rand::{Rng, SeedableRng};

/// Parameters for SGD optimization
#[derive(Debug, Clone)]
pub struct OptimizationParams {
    pub n_epochs: usize,
    pub initial_alpha: f64,
    pub min_dist: f64,
    pub spread: f64,
    pub negative_sample_rate: usize,
    pub repulsion_strength: f64,
    pub random_seed: Option<u64>,
}

impl Default for OptimizationParams {
    fn default() -> Self {
        Self {
            n_epochs: 200,
            initial_alpha: 1.0,
            min_dist: 0.1,
            spread: 1.0,
            negative_sample_rate: 5,
            repulsion_strength: 1.0,
            random_seed: None,
        }
    }
}

/// Curve fitting parameters for the low-dimensional representation
#[derive(Debug, Clone)]
pub struct CurveFitParams {
    pub a: f64,
    pub b: f64,
}

impl CurveFitParams {
    /// Fit curve parameters based on min_dist and spread
    pub fn fit(min_dist: f64, spread: f64) -> Self {
        // Use the same curve fitting as in the original UMAP implementation
        // This approximates the curve: 1 / (1 + a * x^(2*b))

        let y_mid = 0.5;
        let x_mid = spread;

        // Binary search for 'a' parameter
        let mut a_low = 0.001;
        let mut a_high = 1000.0;

        for _ in 0..100 {
            let a_mid = (a_low + a_high) / 2.0;
            let val = curve_function(x_mid, min_dist, a_mid, 1.0);

            if val > y_mid {
                a_low = a_mid;
            } else {
                a_high = a_mid;
            }

            if (a_high - a_low) < 1e-8 {
                break;
            }
        }

        let a = (a_low + a_high) / 2.0;

        // Binary search for 'b' parameter
        let mut b_low = 0.1;
        let mut b_high = 10.0;

        for _ in 0..100 {
            let b_mid = (b_low + b_high) / 2.0;
            let val = curve_function(x_mid, min_dist, a, b_mid);

            if val > y_mid {
                b_high = b_mid;
            } else {
                b_low = b_mid;
            }

            if (b_high - b_low) < 1e-8 {
                break;
            }
        }

        let b = (b_low + b_high) / 2.0;

        Self { a, b }
    }
}

/// The curve function for low-dimensional representation
fn curve_function(x: f64, min_dist: f64, a: f64, b: f64) -> f64 {
    if x <= min_dist {
        1.0
    } else {
        1.0 / (1.0 + a * (x - min_dist).powf(2.0 * b))
    }
}

/// Optimize the embedding using stochastic gradient descent (Algorithm 5)
pub fn optimize_embedding(
    embedding: &mut Array2<f64>,
    fuzzy_set: &FuzzySimplicialSet,
    params: &OptimizationParams,
) -> Result<()> {
    let n_vertices = embedding.nrows();
    let _n_components = embedding.ncols();

    if n_vertices != fuzzy_set.n_vertices {
        return Err(UmapError::DimensionMismatch {
            expected: fuzzy_set.n_vertices,
            actual: n_vertices,
        });
    }

    // Fit curve parameters
    let curve_params = CurveFitParams::fit(params.min_dist, params.spread);

    // Set up random number generator
    let mut rng = match params.random_seed {
        Some(seed) => rand::rngs::StdRng::seed_from_u64(seed),
        None => rand::rngs::StdRng::from_entropy(),
    };

    // Prepare edges for sampling
    let edges: Vec<(usize, usize, f64)> = fuzzy_set.edges.clone();

    if edges.is_empty() {
        return Ok(());
    }

    // Create epoch sampling schedule
    let epochs_per_sample = create_epoch_sampling_schedule(&edges, params.n_epochs);

    // Optimization loop
    for epoch in 0..params.n_epochs {
        // Calculate current learning rate
        let alpha = params.initial_alpha * (1.0 - epoch as f64 / params.n_epochs as f64);

        // Process positive samples
        for (edge_idx, &(i, j, weight)) in edges.iter().enumerate() {
            if epoch >= epochs_per_sample[edge_idx] as usize {
                continue;
            }

            // Apply attractive force
            apply_attractive_force(
                embedding.view_mut(),
                i,
                j,
                weight,
                alpha,
                &curve_params,
            );

            // Apply repulsive forces via negative sampling
            apply_negative_sampling(
                embedding.view_mut(),
                i,
                j,
                weight,
                alpha,
                params.negative_sample_rate,
                params.repulsion_strength,
                &curve_params,
                &mut rng,
            );
        }
    }

    Ok(())
}

/// Create epoch sampling schedule for edges
fn create_epoch_sampling_schedule(
    edges: &[(usize, usize, f64)],
    n_epochs: usize,
) -> Vec<f64> {
    let mut epochs_per_sample = Vec::with_capacity(edges.len());

    for &(_, _, weight) in edges {
        // Higher weight edges are sampled more frequently
        let sample_rate = weight.max(1e-12);
        let epochs_for_edge = n_epochs as f64 / sample_rate;
        epochs_per_sample.push(epochs_for_edge);
    }

    epochs_per_sample
}

/// Apply attractive force between two connected points
fn apply_attractive_force(
    mut embedding: ArrayViewMut2<f64>,
    i: usize,
    j: usize,
    weight: f64,
    alpha: f64,
    curve_params: &CurveFitParams,
) {
    let n_components = embedding.ncols();

    // Calculate distance between points
    let mut dist_squared = 0.0;
    for dim in 0..n_components {
        let diff = embedding[[i, dim]] - embedding[[j, dim]];
        dist_squared += diff * diff;
    }

    // Avoid division by zero
    let dist_squared = dist_squared.max(1e-12);

    // Calculate attractive force gradient
    let grad_coeff = gradient_attractive(dist_squared, curve_params);

    if grad_coeff > 0.0 {
        let update_strength = weight * alpha * grad_coeff;

        for dim in 0..n_components {
            let diff = embedding[[i, dim]] - embedding[[j, dim]];
            let update = update_strength * diff;

            embedding[[i, dim]] -= update;
            embedding[[j, dim]] += update;
        }
    }
}

/// Apply repulsive forces via negative sampling
fn apply_negative_sampling(
    mut embedding: ArrayViewMut2<f64>,
    i: usize,
    j: usize,
    weight: f64,
    alpha: f64,
    negative_sample_rate: usize,
    repulsion_strength: f64,
    curve_params: &CurveFitParams,
    rng: &mut impl Rng,
) -> usize {
    let n_vertices = embedding.nrows();
    let n_components = embedding.ncols();

    let n_negative_samples = (weight * negative_sample_rate as f64) as usize;

    for _ in 0..n_negative_samples {
        // Sample a random negative point
        let k = rng.gen_range(0..n_vertices);

        if k == i || k == j {
            continue;
        }

        // Calculate distance between i and k
        let mut dist_squared = 0.0;
        for dim in 0..n_components {
            let diff = embedding[[i, dim]] - embedding[[k, dim]];
            dist_squared += diff * diff;
        }

        // Avoid division by zero
        let dist_squared = dist_squared.max(1e-12);

        // Calculate repulsive force gradient
        let grad_coeff = gradient_repulsive(dist_squared, curve_params);

        if grad_coeff > 0.0 {
            let update_strength = repulsion_strength * alpha * grad_coeff;

            for dim in 0..n_components {
                let diff = embedding[[i, dim]] - embedding[[k, dim]];
                let update = update_strength * diff;

                embedding[[i, dim]] += update;
            }
        }
    }

    n_negative_samples
}

/// Calculate attractive force gradient: d/dx log(phi(x))
fn gradient_attractive(dist_squared: f64, curve_params: &CurveFitParams) -> f64 {
    let dist = dist_squared.sqrt();
    let denom = 1.0 + curve_params.a * dist.powf(2.0 * curve_params.b);

    if denom > 1e-12 {
        let numerator = 2.0 * curve_params.a * curve_params.b * dist.powf(2.0 * curve_params.b - 1.0);
        numerator / denom
    } else {
        0.0
    }
}

/// Calculate repulsive force gradient: d/dx log(1 - phi(x))
fn gradient_repulsive(dist_squared: f64, curve_params: &CurveFitParams) -> f64 {
    let dist = dist_squared.sqrt();
    let phi = 1.0 / (1.0 + curve_params.a * dist.powf(2.0 * curve_params.b));

    if phi < 1.0 - 1e-12 {
        let grad_phi = gradient_attractive(dist_squared, curve_params);
        -grad_phi / (1.0 - phi)
    } else {
        0.0
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_curve_fit_params() {
        let params = CurveFitParams::fit(0.1, 1.0);

        assert!(params.a > 0.0);
        assert!(params.b > 0.0);

        // Test that the curve gives reasonable values
        let val_at_min_dist = curve_function(0.1, 0.1, params.a, params.b);
        assert!((val_at_min_dist - 1.0).abs() < 1e-6);

        let val_at_spread = curve_function(1.0, 0.1, params.a, params.b);
        assert!(val_at_spread < 1.0 && val_at_spread > 0.0);
    }

    #[test]
    fn test_create_epoch_sampling_schedule() {
        let edges = vec![
            (0, 1, 1.0),
            (1, 2, 0.5),
            (2, 3, 0.25),
        ];

        let schedule = create_epoch_sampling_schedule(&edges, 100);

        assert_eq!(schedule.len(), 3);
        assert!(schedule[0] <= schedule[1]); // Higher weight = lower epochs per sample
        assert!(schedule[1] <= schedule[2]);
    }

    #[test]
    fn test_gradient_attractive() {
        let curve_params = CurveFitParams { a: 1.0, b: 1.0 };
        let grad = gradient_attractive(1.0, &curve_params);

        assert!(grad >= 0.0);
    }

    #[test]
    fn test_simple_force_directed_layout() {
        let mut embedding = Array2::from_shape_vec((3, 2), vec![
            0.0, 0.0,
            1.0, 0.0,
            0.5, 1.0,
        ]).unwrap();

        let mut fuzzy_set = FuzzySimplicialSet::new(3);
        fuzzy_set.add_edge(0, 1, 1.0);
        fuzzy_set.add_edge(1, 2, 1.0);

        let result = simple_force_directed_layout(&mut embedding, &fuzzy_set, 10, 0.1);
        assert!(result.is_ok());
    }
}