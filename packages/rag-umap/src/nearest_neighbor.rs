//! Nearest neighbor search implementation using NN-Descent algorithm

use crate::{DistanceMetric, Result, UmapError};
use ndarray::ArrayView2;
use rand::{Rng, SeedableRng};
use rand::seq::SliceRandom;
use std::collections::HashSet;

/// Represents a neighbor with its index and distance
#[derive(Debug, Clone, PartialEq)]
pub struct Neighbor {
    pub index: usize,
    pub distance: f64,
    pub is_new: bool,
}

impl Neighbor {
    pub fn new(index: usize, distance: f64) -> Self {
        Self {
            index,
            distance,
            is_new: true,
        }
    }
}

impl PartialOrd for Neighbor {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.distance.partial_cmp(&other.distance)
    }
}

/// K-nearest neighbors structure for a single point
#[derive(Debug, Clone)]
pub struct KnnList {
    pub neighbors: Vec<Neighbor>,
    pub capacity: usize,
}

impl KnnList {
    pub fn new(capacity: usize) -> Self {
        Self {
            neighbors: Vec::with_capacity(capacity),
            capacity,
        }
    }

    /// Try to insert a new neighbor, maintaining sorted order and capacity
    pub fn insert(&mut self, neighbor: Neighbor) -> bool {
        // Check if this neighbor already exists
        if self.neighbors.iter().any(|n| n.index == neighbor.index) {
            return false;
        }

        // If we have space, just add it
        if self.neighbors.len() < self.capacity {
            self.neighbors.push(neighbor);
            self.neighbors.sort_by(|a, b| a.partial_cmp(b).unwrap());
            return true;
        }

        // If this neighbor is better than the worst current neighbor, replace it
        if neighbor.distance < self.neighbors.last().unwrap().distance {
            self.neighbors.pop();
            self.neighbors.push(neighbor);
            self.neighbors.sort_by(|a, b| a.partial_cmp(b).unwrap());
            return true;
        }

        false
    }

    /// Get the distances to all neighbors
    pub fn distances(&self) -> Vec<f64> {
        self.neighbors.iter().map(|n| n.distance).collect()
    }

    /// Get the indices of all neighbors
    pub fn indices(&self) -> Vec<usize> {
        self.neighbors.iter().map(|n| n.index).collect()
    }

    /// Mark all neighbors as old (not new)
    pub fn mark_all_old(&mut self) {
        for neighbor in &mut self.neighbors {
            neighbor.is_new = false;
        }
    }

    /// Get new neighbors only
    pub fn new_neighbors(&self) -> Vec<&Neighbor> {
        self.neighbors.iter().filter(|n| n.is_new).collect()
    }

}

/// NN-Descent algorithm implementation for approximate nearest neighbor search
pub struct NNDescent {
    pub rho: f64,          // Sample rate for neighbors
    pub max_candidates: usize, // Maximum number of candidates to consider
    pub max_iterations: usize, // Maximum number of iterations
    pub delta: f64,        // Convergence threshold
}

impl Default for NNDescent {
    fn default() -> Self {
        Self {
            rho: 0.5,
            max_candidates: 50,
            max_iterations: 10,
            delta: 0.001,
        }
    }
}

impl NNDescent {
    pub fn new() -> Self {
        Self::default()
    }

    /// Find approximate k-nearest neighbors for all points in the dataset
    pub fn nn_descent(
        &self,
        data: ArrayView2<f64>,
        k: usize,
        distance_metric: &dyn DistanceMetric,
        random_seed: Option<u64>,
    ) -> Result<Vec<KnnList>> {
        let n_samples = data.nrows();

        if k >= n_samples {
            return Err(UmapError::InvalidParameter(
                format!("k ({}) must be less than number of samples ({})", k, n_samples)
            ));
        }

        let mut rng = match random_seed {
            Some(seed) => rand::rngs::StdRng::seed_from_u64(seed),
            None => rand::rngs::StdRng::from_entropy(),
        };

        // Initialize with random neighbors
        let mut knn_lists = self.initialize_random(&mut rng, n_samples, k)?;

        // Compute initial distances
        for i in 0..n_samples {
            let point_i = data.row(i);
            let neighbors = &mut knn_lists[i].neighbors;

            for neighbor in neighbors.iter_mut() {
                let point_j = data.row(neighbor.index);
                neighbor.distance = distance_metric.distance(point_i, point_j);
            }

            knn_lists[i].neighbors.sort_by(|a, b| a.partial_cmp(b).unwrap());
        }

        // NN-Descent iterations
        for _iteration in 0..self.max_iterations {
            let mut num_updates = 0;

            // Create candidate sets
            let candidates = self.build_candidate_sets(&knn_lists, &mut rng);

            // Process candidates for each point
            for i in 0..n_samples {
                let point_i = data.row(i);

                for &candidate_idx in &candidates[i] {
                    if candidate_idx != i {
                        let point_j = data.row(candidate_idx);
                        let distance = distance_metric.distance(point_i, point_j);
                        let neighbor = Neighbor::new(candidate_idx, distance);

                        if knn_lists[i].insert(neighbor) {
                            num_updates += 1;
                        }
                    }
                }
            }

            // Mark all neighbors as old for next iteration
            for knn_list in &mut knn_lists {
                knn_list.mark_all_old();
            }

            // Check for convergence
            let update_rate = num_updates as f64 / (n_samples * k) as f64;
            if update_rate < self.delta {
                break;
            }
        }

        Ok(knn_lists)
    }

    /// Initialize k-nearest neighbor lists with random neighbors
    fn initialize_random(
        &self,
        rng: &mut impl Rng,
        n_samples: usize,
        k: usize,
    ) -> Result<Vec<KnnList>> {
        let mut knn_lists = Vec::with_capacity(n_samples);

        for i in 0..n_samples {
            let mut knn_list = KnnList::new(k);

            // Generate random neighbors (excluding self)
            let mut indices: Vec<usize> = (0..n_samples).filter(|&x| x != i).collect();
            indices.shuffle(rng);

            for &j in indices.iter().take(k) {
                let neighbor = Neighbor::new(j, f64::INFINITY); // Distance will be computed later
                knn_list.neighbors.push(neighbor);
            }

            knn_lists.push(knn_list);
        }

        Ok(knn_lists)
    }

    /// Build candidate sets for each point based on current neighbors
    fn build_candidate_sets(
        &self,
        knn_lists: &[KnnList],
        rng: &mut impl Rng,
    ) -> Vec<HashSet<usize>> {
        let n_samples = knn_lists.len();
        let mut candidates = vec![HashSet::new(); n_samples];

        for i in 0..n_samples {
            let knn_list = &knn_lists[i];

            // Sample from new neighbors
            let new_neighbors: Vec<usize> = knn_list
                .new_neighbors()
                .iter()
                .map(|n| n.index)
                .collect();

            let sample_size = ((new_neighbors.len() as f64 * self.rho).ceil() as usize)
                .min(new_neighbors.len())
                .min(self.max_candidates);

            let sampled_new: Vec<usize> = new_neighbors.choose_multiple(rng, sample_size).cloned().collect();

            // Sample from old neighbors
            let old_neighbors: Vec<usize> = knn_list
                .neighbors
                .iter()
                .filter(|n| !n.is_new)
                .map(|n| n.index)
                .collect();

            let sample_size = ((old_neighbors.len() as f64 * self.rho).ceil() as usize)
                .min(old_neighbors.len())
                .min(self.max_candidates);

            let sampled_old: Vec<usize> = old_neighbors.choose_multiple(rng, sample_size).cloned().collect();

            // Add candidates for point i (combinations of new and old neighbors)
            for &new_idx in &sampled_new {
                for &old_idx in &sampled_old {
                    candidates[new_idx].insert(old_idx);
                    candidates[old_idx].insert(new_idx);
                }

                // Also add new-new combinations
                for &other_new_idx in &sampled_new {
                    if new_idx != other_new_idx {
                        candidates[new_idx].insert(other_new_idx);
                    }
                }
            }
        }

        candidates
    }
}

/// Simple brute force k-nearest neighbors (for small datasets or testing)
pub fn brute_force_knn(
    data: ArrayView2<f64>,
    k: usize,
    distance_metric: &dyn DistanceMetric,
) -> Result<Vec<KnnList>> {
    let n_samples = data.nrows();

    if k >= n_samples {
        return Err(UmapError::InvalidParameter(
            format!("k ({}) must be less than number of samples ({})", k, n_samples)
        ));
    }

    let mut knn_lists = Vec::with_capacity(n_samples);

    for i in 0..n_samples {
        let mut knn_list = KnnList::new(k);
        let point_i = data.row(i);

        // Compute distances to all other points
        let mut distances: Vec<(usize, f64)> = Vec::new();
        for j in 0..n_samples {
            if i != j {
                let point_j = data.row(j);
                let distance = distance_metric.distance(point_i, point_j);
                distances.push((j, distance));
            }
        }

        // Sort by distance and take k nearest
        distances.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

        for (j, distance) in distances.into_iter().take(k) {
            let neighbor = Neighbor::new(j, distance);
            knn_list.neighbors.push(neighbor);
        }

        knn_lists.push(knn_list);
    }

    Ok(knn_lists)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::distance::EuclideanDistance;
    use ndarray::Array2;

    #[test]
    fn test_knn_list() {
        let mut knn_list = KnnList::new(3);

        assert!(knn_list.insert(Neighbor::new(1, 5.0)));
        assert!(knn_list.insert(Neighbor::new(2, 3.0)));
        assert!(knn_list.insert(Neighbor::new(3, 7.0)));

        // Should be sorted by distance
        assert_eq!(knn_list.neighbors[0].index, 2); // distance 3.0
        assert_eq!(knn_list.neighbors[1].index, 1); // distance 5.0
        assert_eq!(knn_list.neighbors[2].index, 3); // distance 7.0

        // Trying to insert a better neighbor should work
        assert!(knn_list.insert(Neighbor::new(4, 1.0)));
        assert_eq!(knn_list.neighbors.len(), 3);
        assert_eq!(knn_list.neighbors[0].index, 4); // distance 1.0

        // Trying to insert a worse neighbor should fail
        assert!(!knn_list.insert(Neighbor::new(5, 10.0)));
    }

    #[test]
    fn test_brute_force_knn() {
        // Create simple 2D test data
        let data = Array2::from_shape_vec((4, 2), vec![
            0.0, 0.0,  // Point 0
            1.0, 0.0,  // Point 1
            0.0, 1.0,  // Point 2
            1.0, 1.0,  // Point 3
        ]).unwrap();

        let distance_metric = EuclideanDistance;
        let result = brute_force_knn(data.view(), 2, &distance_metric).unwrap();

        assert_eq!(result.len(), 4);

        // Check that each point has 2 neighbors
        for knn_list in &result {
            assert_eq!(knn_list.neighbors.len(), 2);
        }

        // Point 0's nearest neighbors should be points 1 and 2 (distance 1.0 each)
        let point_0_neighbors = &result[0];
        assert!(point_0_neighbors.neighbors.iter().any(|n| n.index == 1));
        assert!(point_0_neighbors.neighbors.iter().any(|n| n.index == 2));
    }
}