//! UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction
//!
//! A Rust implementation of the UMAP algorithm for manifold learning and dimension reduction.
//! Based on the paper: "UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction"
//! by Leland McInnes, John Healy, and James Melville.

use ndarray::{Array2, ArrayView1, ArrayView2};
use thiserror::Error;

mod distance;
mod nearest_neighbor;
mod simplicial_set;
mod spectral;
mod optimization;

/// Errors that can occur during UMAP computation
#[derive(Error, Debug)]
pub enum UmapError {
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),
    #[error("Computation error: {0}")]
    ComputationError(String),
    #[error("Dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },
    #[error("Insufficient data: need at least {min} samples, got {actual}")]
    InsufficientData { min: usize, actual: usize },
}

pub type Result<T> = std::result::Result<T, UmapError>;

/// Distance metric trait for computing distances between data points
trait DistanceMetric: Send + Sync {
    /// Compute the distance between two points
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64;

}

/// UMAP hyperparameters and configuration
#[derive(Debug, Clone)]
struct UmapParams {
    /// Number of nearest neighbors to consider for manifold approximation
    pub n_neighbors: usize,
    /// Target embedding dimension
    pub n_components: usize,
    /// Minimum distance between points in the embedding
    pub min_dist: f64,
    /// Number of optimization epochs
    pub n_epochs: usize,
    /// Number of negative samples per positive sample during optimization
    pub negative_sample_rate: usize,
    /// Random seed for reproducible results
    pub random_seed: Option<u64>,
    /// Spread parameter for low-dimensional representation
    pub spread: f64,
    /// Set connectivity parameter for local connectivity constraint
    pub set_op_mix_ratio: f64,
    /// Local connectivity parameter
    pub local_connectivity: f64,
    /// Repulsion strength parameter
    pub repulsion_strength: f64,
    /// Initial alpha for optimization
    pub initial_alpha: f64,
}

impl Default for UmapParams {
    fn default() -> Self {
        Self {
            n_neighbors: 15,
            n_components: 2,
            min_dist: 0.1,
            n_epochs: 200,
            negative_sample_rate: 5,
            random_seed: None,
            spread: 1.0,
            set_op_mix_ratio: 1.0,
            local_connectivity: 1.0,
            repulsion_strength: 1.0,
            initial_alpha: 1.0,
        }
    }
}

impl UmapParams {
    /// Create a new UmapParams with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the number of neighbors
    pub fn n_neighbors(mut self, n_neighbors: usize) -> Self {
        self.n_neighbors = n_neighbors;
        self
    }

    /// Set the number of components (embedding dimension)
    pub fn n_components(mut self, n_components: usize) -> Self {
        self.n_components = n_components;
        self
    }

    /// Set the minimum distance between points in the embedding
    pub fn min_dist(mut self, min_dist: f64) -> Self {
        self.min_dist = min_dist;
        self
    }

    /// Set the spread of the low-dimensional representation
    pub fn spread(mut self, spread: f64) -> Self {
        self.spread = spread;
        self
    }

    /// Validate the parameters
    pub fn validate(&self) -> Result<()> {
        if self.n_neighbors < 2 {
            return Err(UmapError::InvalidParameter(
                "n_neighbors must be at least 2".to_string()
            ));
        }

        if self.n_components < 1 {
            return Err(UmapError::InvalidParameter(
                "n_components must be at least 1".to_string()
            ));
        }

        if self.min_dist < 0.0 {
            return Err(UmapError::InvalidParameter(
                "min_dist must be non-negative".to_string()
            ));
        }

        if self.n_epochs == 0 {
            return Err(UmapError::InvalidParameter(
                "n_epochs must be positive".to_string()
            ));
        }

        Ok(())
    }
}

/// Represents a fuzzy simplicial set as a sparse graph
#[derive(Debug, Clone)]
struct FuzzySimplicialSet {
    /// Adjacency matrix stored as (row, col, weight) tuples
    pub edges: Vec<(usize, usize, f64)>,
    /// Number of vertices in the graph
    pub n_vertices: usize,
}

impl FuzzySimplicialSet {
    /// Create a new empty fuzzy simplicial set
    pub fn new(n_vertices: usize) -> Self {
        Self {
            edges: Vec::new(),
            n_vertices,
        }
    }

    /// Add an edge to the fuzzy simplicial set
    pub fn add_edge(&mut self, i: usize, j: usize, weight: f64) {
        if weight > 0.0 {
            self.edges.push((i, j, weight));
        }
    }

}

/// Main UMAP struct for dimensionality reduction
struct Umap {
    /// UMAP parameters
    pub params: UmapParams,
    /// Distance metric to use
    distance_metric: Box<dyn DistanceMetric>,
    /// Fitted embedding (available after calling fit_transform)
    pub embedding: Option<Array2<f64>>,
    /// Fuzzy simplicial set representation of the data
    pub fuzzy_set: Option<FuzzySimplicialSet>,
}

impl Umap {
    /// Create a new UMAP instance with the given parameters and distance metric
    pub fn new(params: UmapParams, distance_metric: Box<dyn DistanceMetric>) -> Result<Self> {
        params.validate()?;

        Ok(Self {
            params,
            distance_metric,
            embedding: None,
            fuzzy_set: None,
        })
    }

    /// Create a new UMAP instance with default parameters and Euclidean distance
    pub fn new_with_euclidean_distance() -> Result<Self> {
        let params = UmapParams::default();
        let distance_metric = Box::new(distance::EuclideanDistance);
        Self::new(params, distance_metric)
    }

    /// Fit UMAP to the data and return the embedding
    pub fn fit_transform(&mut self, data: ArrayView2<f64>) -> Result<Array2<f64>> {
        let n_samples = data.nrows();
        let _n_features = data.ncols();

        // Validate input
        if n_samples < self.params.n_neighbors {
            return Err(UmapError::InsufficientData {
                min: self.params.n_neighbors,
                actual: n_samples,
            });
        }

        // Step 1: Construct fuzzy simplicial set representation
        let fuzzy_set = self.construct_fuzzy_simplicial_set(data)?;
        self.fuzzy_set = Some(fuzzy_set.clone());

        // Step 2: Initialize embedding using spectral embedding
        let mut embedding = self.spectral_layout(&fuzzy_set)?;

        // Step 3: Optimize embedding using SGD
        self.optimize_layout(&mut embedding, &fuzzy_set, data)?;

        self.embedding = Some(embedding.clone());
        Ok(embedding)
    }


    /// Construct fuzzy simplicial set representation of the data
    fn construct_fuzzy_simplicial_set(&self, data: ArrayView2<f64>) -> Result<FuzzySimplicialSet> {
        simplicial_set::fuzzy_simplicial_set(
            data,
            self.params.n_neighbors,
            self.distance_metric.as_ref(),
            self.params.local_connectivity,
            self.params.set_op_mix_ratio,
            self.params.random_seed,
        )
    }

    /// Initialize embedding using spectral layout
    fn spectral_layout(&self, fuzzy_set: &FuzzySimplicialSet) -> Result<Array2<f64>> {
        spectral::spectral_layout(fuzzy_set, self.params.n_components)
    }

    /// Optimize the embedding layout using SGD
    fn optimize_layout(
        &self,
        embedding: &mut Array2<f64>,
        fuzzy_set: &FuzzySimplicialSet,
        _data: ArrayView2<f64>,
    ) -> Result<()> {
        let opt_params = optimization::OptimizationParams {
            n_epochs: self.params.n_epochs,
            initial_alpha: self.params.initial_alpha,
            min_dist: self.params.min_dist,
            spread: self.params.spread,
            negative_sample_rate: self.params.negative_sample_rate,
            repulsion_strength: self.params.repulsion_strength,
            random_seed: self.params.random_seed,
        };

        optimization::optimize_embedding(embedding, fuzzy_set, &opt_params)
    }
}

/// Tunable hyperparameters for 2D UMAP projection.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Umap2dConfig {
    /// Number of nearest neighbors to consider for manifold approximation.
    pub n_neighbors: usize,
    /// Minimum distance between points in the embedding.
    pub min_dist: f64,
    /// Spread parameter for the low-dimensional representation.
    pub spread: f64,
}

impl Default for Umap2dConfig {
    fn default() -> Self {
        Self {
            n_neighbors: 15,
            min_dist: 0.1,
            spread: 1.0,
        }
    }
}

fn fit_umap_2d<T: Into<f64> + Copy>(
    embeddings: Vec<Vec<T>>,
    config: Umap2dConfig,
) -> Result<Vec<Vec<f64>>> {
    let n_samples = embeddings.len();
    let n_features = embeddings.first().map(|row| row.len()).unwrap_or(0);

    let mut data = Array2::zeros((n_samples, n_features));
    for (i, row) in embeddings.iter().enumerate() {
        for (j, &val) in row.iter().enumerate() {
            data[[i, j]] = val.into();
        }
    }

    let n_neighbors = config.n_neighbors.min(n_samples - 1).max(2);
    let params = UmapParams::new()
        .n_components(2)
        .n_neighbors(n_neighbors)
        .min_dist(config.min_dist)
        .spread(config.spread);

    let mut umap = Umap::new_with_euclidean_distance()?;
    umap.params = params;
    let result = umap.fit_transform(data.view())?;

    let mut output = Vec::new();
    for i in 0..result.nrows() {
        output.push(vec![result[[i, 0]], result[[i, 1]]]);
    }
    Ok(output)
}

/// Convert embeddings to 2D space using UMAP
///
/// # Arguments
/// * `embeddings` - Input embeddings as Vec<Vec<T>> where T can be converted to f64
///
/// # Returns
/// * `Result<Vec<Vec<f64>>>` - 2D embedding with same number of rows as input
pub fn convert_to_2d<T: Into<f64> + Copy>(embeddings: Vec<Vec<T>>) -> Result<Vec<Vec<f64>>> {
    fit_umap_2d(embeddings, Umap2dConfig::default())
}

/// Convert embeddings to 2D space using UMAP with explicit hyperparameters.
pub fn convert_to_2d_with_config<T: Into<f64> + Copy>(
    embeddings: Vec<Vec<T>>,
    config: Umap2dConfig,
) -> Result<Vec<Vec<f64>>> {
    fit_umap_2d(embeddings, config)
}

/// Convert embeddings to 3D space using UMAP
///
/// # Arguments
/// * `embeddings` - Input embeddings as Vec<Vec<T>> where T can be converted to f64
///
/// # Returns
/// * `Result<Vec<Vec<f64>>>` - 3D embedding with same number of rows as input
pub fn convert_to_3d<T: Into<f64> + Copy>(embeddings: Vec<Vec<T>>) -> Result<Vec<Vec<f64>>> {
    let n_samples = embeddings.len();
    let n_features = embeddings.first().map(|row| row.len()).unwrap_or(0);

    let mut data = Array2::zeros((n_samples, n_features));
    for (i, row) in embeddings.iter().enumerate() {
        for (j, &val) in row.iter().enumerate() {
            data[[i, j]] = val.into();
        }
    }

    let params = UmapParams::new()
        .n_components(3)
        .n_neighbors(15.min(n_samples - 1));

    let mut umap = Umap::new_with_euclidean_distance()?;
    umap.params = params;
    let result = umap.fit_transform(data.view())?;

    let mut output = Vec::new();
    for i in 0..result.nrows() {
        output.push(vec![result[[i, 0]], result[[i, 1]], result[[i, 2]]]);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::Array2;

    #[test]
    fn test_umap_params_validation() {
        let valid_params = UmapParams::new()
            .n_neighbors(10)
            .n_components(2)
            .min_dist(0.1);

        assert!(valid_params.validate().is_ok());

        let invalid_params = UmapParams::new().n_neighbors(1);
        assert!(invalid_params.validate().is_err());
    }

    #[test]
    fn test_fuzzy_simplicial_set() {
        let mut fs_set = FuzzySimplicialSet::new(3);
        fs_set.add_edge(0, 1, 0.5);
        fs_set.add_edge(1, 2, 0.8);

        assert_eq!(fs_set.edges.len(), 2);
        assert_eq!(fs_set.vertex_degree(0), 0.5);
        assert_eq!(fs_set.vertex_degree(1), 0.8);
    }
}