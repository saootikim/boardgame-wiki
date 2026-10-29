import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

// 노트마다 GitHub 웹 편집창으로 가는 "이 페이지 수정" 버튼
const REPO_EDIT = "https://github.com/saootikim/boardgame-wiki/edit/main/"

const EditLink: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const rel = fileData.relativePath
  if (!rel) return null
  // index.md는 빌드할 때 INDEX.md를 복사한 것
  const path = rel === "index.md" ? "INDEX.md" : rel
  return (
    <p>
      <a class="external edit-link" href={REPO_EDIT + encodeURI(path)} target="_blank" rel="noopener">
        ✏️ 이 페이지 수정
      </a>
    </p>
  )
}

export default (() => EditLink) satisfies QuartzComponentConstructor
