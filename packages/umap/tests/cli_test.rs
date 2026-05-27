use assert_cmd::Command;

fn umap_bin() -> Command {
    Command::cargo_bin("umap").unwrap()
}

#[test]
fn valid_json_returns_coordinates() {
    let input = r#"{"embeddings":[[0,0,0],[1,0,0],[0,1,0],[1,1,0]]}"#;

    umap_bin()
        .write_stdin(input)
        .assert()
        .success()
        .stdout(predicates::str::contains(r#""coordinates""#));
}

#[test]
fn invalid_json_exits_with_error() {
    umap_bin()
        .write_stdin("not-json")
        .assert()
        .failure()
        .stderr(predicates::str::contains("invalid JSON input"));
}

#[test]
fn empty_embeddings_exits_with_error() {
    umap_bin()
        .write_stdin(r#"{"embeddings":[]}"#)
        .assert()
        .failure()
        .stderr(predicates::str::contains("empty"));
}
