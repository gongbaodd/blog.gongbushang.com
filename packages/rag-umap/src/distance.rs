//! Distance metrics for UMAP

use crate::DistanceMetric;
use ndarray::{ArrayView1, Zip};

/// Euclidean (L2) distance metric
#[derive(Debug, Clone)]
pub struct EuclideanDistance;

impl DistanceMetric for EuclideanDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        let mut sum = 0.0;
        Zip::from(x).and(y).for_each(|&xi, &yi| {
            let diff = xi - yi;
            sum += diff * diff;
        });
        sum.sqrt()
    }

}

/// Manhattan (L1) distance metric
#[derive(Debug, Clone)]
pub struct ManhattanDistance;

impl DistanceMetric for ManhattanDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        let mut sum = 0.0;
        Zip::from(x).and(y).for_each(|&xi, &yi| {
            sum += (xi - yi).abs();
        });
        sum
    }

}

/// Cosine distance metric (1 - cosine similarity)
#[derive(Debug, Clone)]
pub struct CosineDistance;

impl DistanceMetric for CosineDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        let mut dot_product = 0.0;
        let mut norm_x = 0.0;
        let mut norm_y = 0.0;

        Zip::from(x).and(y).for_each(|&xi, &yi| {
            dot_product += xi * yi;
            norm_x += xi * xi;
            norm_y += yi * yi;
        });

        let norm_product = (norm_x * norm_y).sqrt();
        if norm_product == 0.0 {
            return 0.0;
        }

        let cosine_sim = dot_product / norm_product;
        1.0 - cosine_sim.clamp(-1.0, 1.0)
    }

}

/// Hamming distance metric (for binary data)
#[derive(Debug, Clone)]
pub struct HammingDistance;

impl DistanceMetric for HammingDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        let mut differences = 0;
        Zip::from(x).and(y).for_each(|&xi, &yi| {
            if (xi - yi).abs() > f64::EPSILON {
                differences += 1;
            }
        });

        differences as f64 / x.len() as f64
    }

}

/// Chebyshev (L∞) distance metric
#[derive(Debug, Clone)]
pub struct ChebyshevDistance;

impl DistanceMetric for ChebyshevDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        let mut max_diff = 0.0;
        Zip::from(x).and(y).for_each(|&xi, &yi| {
            let diff = (xi - yi).abs();
            if diff > max_diff {
                max_diff = diff;
            }
        });
        max_diff
    }

}

/// Minkowski distance metric with parameter p
#[derive(Debug, Clone)]
pub struct MinkowskiDistance {
    pub p: f64,
}


impl DistanceMetric for MinkowskiDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        if self.p == 1.0 {
            // Manhattan distance
            let mut sum = 0.0;
            Zip::from(x).and(y).for_each(|&xi, &yi| {
                sum += (xi - yi).abs();
            });
            sum
        } else if self.p == 2.0 {
            // Euclidean distance
            let mut sum = 0.0;
            Zip::from(x).and(y).for_each(|&xi, &yi| {
                let diff = xi - yi;
                sum += diff * diff;
            });
            sum.sqrt()
        } else if self.p.is_infinite() {
            // Chebyshev distance
            let mut max_diff = 0.0;
            Zip::from(x).and(y).for_each(|&xi, &yi| {
                let diff = (xi - yi).abs();
                if diff > max_diff {
                    max_diff = diff;
                }
            });
            max_diff
        } else {
            // General Minkowski distance
            let mut sum = 0.0;
            Zip::from(x).and(y).for_each(|&xi, &yi| {
                sum += (xi - yi).abs().powf(self.p);
            });
            sum.powf(1.0 / self.p)
        }
    }

}

/// Jaccard distance metric (for binary/set data)
#[derive(Debug, Clone)]
pub struct JaccardDistance;

impl DistanceMetric for JaccardDistance {
    fn distance(&self, x: ArrayView1<f64>, y: ArrayView1<f64>) -> f64 {
        debug_assert_eq!(x.len(), y.len());

        let mut intersection = 0;
        let mut union = 0;

        Zip::from(x).and(y).for_each(|&xi, &yi| {
            let x_present = xi > 0.5;
            let y_present = yi > 0.5;

            if x_present && y_present {
                intersection += 1;
            }
            if x_present || y_present {
                union += 1;
            }
        });

        if union == 0 {
            0.0
        } else {
            1.0 - (intersection as f64) / (union as f64)
        }
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::Array1;

    #[test]
    fn test_euclidean_distance() {
        let x = Array1::from(vec![1.0, 2.0, 3.0]);
        let y = Array1::from(vec![4.0, 5.0, 6.0]);

        let distance = EuclideanDistance;
        let result = distance.distance(x.view(), y.view());

        // Expected: sqrt((4-1)^2 + (5-2)^2 + (6-3)^2) = sqrt(9 + 9 + 9) = sqrt(27)
        let expected = (27.0_f64).sqrt();
        assert!((result - expected).abs() < 1e-10);
    }

    #[test]
    fn test_manhattan_distance() {
        let x = Array1::from(vec![1.0, 2.0, 3.0]);
        let y = Array1::from(vec![4.0, 5.0, 6.0]);

        let distance = ManhattanDistance;
        let result = distance.distance(x.view(), y.view());

        // Expected: |4-1| + |5-2| + |6-3| = 3 + 3 + 3 = 9
        let expected = 9.0;
        assert!((result - expected).abs() < 1e-10);
    }

    #[test]
    fn test_cosine_distance() {
        let x = Array1::from(vec![1.0, 0.0, 0.0]);
        let y = Array1::from(vec![0.0, 1.0, 0.0]);

        let distance = CosineDistance;
        let result = distance.distance(x.view(), y.view());

        // These are orthogonal vectors, so cosine similarity is 0, distance is 1
        let expected = 1.0;
        assert!((result - expected).abs() < 1e-10);
    }

    #[test]
    fn test_minkowski_distance() {
        let x = Array1::from(vec![1.0, 2.0, 3.0]);
        let y = Array1::from(vec![4.0, 5.0, 6.0]);

        // Test p=1 (Manhattan)
        let distance = MinkowskiDistance::new(1.0);
        let result = distance.distance(x.view(), y.view());
        assert!((result - 9.0).abs() < 1e-10);

        // Test p=2 (Euclidean)
        let distance = MinkowskiDistance::new(2.0);
        let result = distance.distance(x.view(), y.view());
        let expected = (27.0_f64).sqrt();
        assert!((result - expected).abs() < 1e-10);
    }
}