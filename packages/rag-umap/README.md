# RAG-UMAP: A Rust Implementation of UMAP

A pure Rust implementation of UMAP (Uniform Manifold Approximation and Projection) for dimension reduction, based on the paper by Leland McInnes, John Healy, and James Melville.

## Features

- **Complete UMAP Implementation**: All core algorithms from the original paper
- **Multiple Distance Metrics**: Euclidean, Manhattan, Cosine, Hamming, Chebyshev, Minkowski, and Jaccard
- **Approximate Nearest Neighbors**: NN-Descent algorithm for efficient k-NN search
- **Spectral Initialization**: Power iteration method for robust spectral embedding
- **Stochastic Gradient Descent**: Optimized SGD with negative sampling
- **Configurable Parameters**: Full control over all UMAP hyperparameters

## Algorithms Implemented

1. **Algorithm 1**: Main UMAP algorithm
2. **Algorithm 2**: Local fuzzy simplicial set construction
3. **Algorithm 3**: Smooth k-NN distance computation
4. **Algorithm 4**: Spectral embedding initialization
5. **Algorithm 5**: SGD optimization with negative sampling

## Quick Start

Add this to your `Cargo.toml`:

```toml
[dependencies]
rag-umap = "0.1.0"
```

### Basic Usage

```rust
use rag_umap::{convert_to_2d, convert_to_3d};

// Your high-dimensional embeddings data
let embeddings = vec![
    vec![1.0, 2.0, 3.0, 4.0, 5.0],
    vec![2.0, 3.0, 4.0, 5.0, 6.0],
    vec![3.0, 4.0, 5.0, 6.0, 7.0],
    // ... more data points
];

// Convert to 2D using UMAP
let embedding_2d = convert_to_2d(embeddings.clone())?;
println!("2D embedding: {:?}", embedding_2d);

// Convert to 3D using UMAP
let embedding_3d = convert_to_3d(embeddings)?;
println!("3D embedding: {:?}", embedding_3d);
```

### Supported Input Types

The conversion functions accept any type that implements `Into<f64> + Copy`:

```rust
// Works with integers
let int_embeddings = vec![vec![1, 2, 3], vec![4, 5, 6]];
let result = convert_to_2d(int_embeddings)?;

// Works with floats
let float_embeddings = vec![vec![1.0f32, 2.0f32], vec![3.0f32, 4.0f32]];
let result = convert_to_2d(float_embeddings)?;
```

## Algorithm Parameters

The library uses optimized default parameters internally:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `n_neighbors` | Number of nearest neighbors | 15 (or data size - 1 if smaller) |
| `n_components` | Target embedding dimension | 2 for `convert_to_2d`, 3 for `convert_to_3d` |
| `min_dist` | Minimum distance between points in embedding | 0.1 |
| `n_epochs` | Number of optimization epochs | 200 |
| `negative_sample_rate` | Negative samples per positive sample | 5 |
| `spread` | Spread parameter for low-dimensional representation | 1.0 |
| `local_connectivity` | Local connectivity parameter | 1.0 |
| `repulsion_strength` | Repulsion strength parameter | 1.0 |

### How UMAP Works

- **Local Structure**: Preserves fine-grained neighborhood relationships
- **Global Structure**: Maintains overall data topology
- **Automatic Scaling**: Adapts neighbor count to dataset size
- **Euclidean Distance**: Uses L2 distance metric internally

## Examples

See the `examples/` directory for complete examples:

```bash
cargo run --example basic_usage
```

## Performance

This implementation includes several optimizations:

- **NN-Descent**: O(N^1.14) approximate nearest neighbor search
- **Power Iteration**: Robust spectral embedding for large graphs
- **Negative Sampling**: Efficient repulsive force computation
- **Sparse Representations**: Memory-efficient fuzzy simplicial sets

## Theoretical Background

UMAP is based on:

1. **Riemannian Geometry**: Local manifold approximation
2. **Algebraic Topology**: Fuzzy simplicial set representations
3. **Category Theory**: Functors between metric spaces and topological structures

The algorithm constructs a high-dimensional fuzzy topological representation of the data, then optimizes a low-dimensional representation to match this structure using cross-entropy minimization.

## Comparison with Other Methods

| Method | Local Structure | Global Structure | Scalability | Embedding Dimension |
|--------|----------------|------------------|-------------|-------------------|
| **UMAP** | ✓ | ✓ | High | Any |
| t-SNE | ✓ | Limited | Medium | Typically 2-3 |
| PCA | Limited | ✓ | High | Any |
| Isomap | ✓ | ✓ | Low | Any |

## Limitations

- Assumes data lies on a manifold
- May find structure in noise (constellation effect)
- Local distance prioritized over global distance
- Requires parameter tuning for optimal results

## License

This implementation is based on the UMAP paper:
> McInnes, L., Healy, J., & Melville, J. (2018). UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction. arXiv preprint arXiv:1802.03426.

## Contributing

Contributions are welcome!