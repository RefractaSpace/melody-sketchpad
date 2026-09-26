# GitHub 자동 테스트 (CI) 켜는 법
`test.yml`을 `.github/workflows/test.yml`로 옮기면, GitHub에 올릴 때마다 자동 테스트(src·public)가 돌아요.

올리는 데 쓰는 토큰에 **Workflows (읽기·쓰기)** 권한이 있어야 이 파일을 올릴 수 있어요.
GitHub → Settings → Developer settings → Fine-grained tokens → 토큰 → Repository permissions → **Workflows: Read and write**
