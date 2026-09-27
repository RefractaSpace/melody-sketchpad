// DB 연결 정보(DATABASE_URL)가 있으면 DB 버전, 없으면 파일 저장소 버전 — DB를 켜도 주소는 그대로
import legacy from './_legacy/auth.js';
import withDB from './_impl/auth-db.js';
import { hasDB } from './_db.js';
export default (req, res) => (hasDB() ? withDB : legacy)(req, res);
