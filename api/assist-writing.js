module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'GET, POST');
  return res.status(410).json({
    error: '이 기능은 브라우저 내 무료 문장 조합 방식으로 변경되었습니다.'
  });
};
