#!/usr/bin/env bash
#
# 그린스크린 standing 원본을 로비용 알파 webm으로 굽는다.
# 크로마키로 배경을 뚫고, 정방향 뒤에 역방향을 붙여 끝이 튀지 않게 만든다.
#
# 원본은 2:3으로 뽑는다. 로비 CSS가 aspect-ratio: 2 / 3을 강제하므로 다른
# 비율이 들어오면 화면에서 눌린다. 권장 크기는 720x1080이다. standing은 창
# 높이(CSS px)만큼 그려지는데, 1080이면 1080p 전체화면에서 등배가 된다.
#
# 알파 webm을 못 그리는 Safari/iOS는 hevc mov 폴백을 타고, 그마저 실패하면
# 정지화 webp로 내려간다. 480p로도 14MB인 gif는 후보에서 뺐다.
#
# 사용법: npm run build:standing -- <webm> [crf]
#         ./tools/pingpong.sh <webm> [crf]
#
# <webm>에 경로 구분자가 없으면 assets/cards/standing/ 에서 찾는다.
# 산출물은 언제나 입력 파일 옆에 <원본이름>_pingpong.webm 으로 떨어진다.

set -euo pipefail

# 자산을 한 번 굽고 끝내므로 인코딩 속도보다 화질과 용량을 택한다.
DEFAULT_CRF=33
# 파일명만 넘겼을 때 뒤져볼 기본 위치다. 저장소 루트 기준으로 잡는다.
DEFAULT_DIR=assets/cards/standing

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "사용법: $0 <webm> [crf]" >&2
  exit 2
fi

# 자산 트리(/assets)는 심볼릭 링크일 수 있어 cwd가 아니라 스크립트 위치에서 잡는다.
repo_root=$(cd -- "$(dirname -- "$0")/.." && pwd)
input_arg=$1
crf=${2:-$DEFAULT_CRF}

if [[ ! "$crf" =~ ^[0-9]+$ ]] || (( crf > 63 )); then
  echo "crf는 0~63 사이의 정수여야 합니다: $crf" >&2
  exit 2
fi

if [[ "$input_arg" == */* ]]; then
  input_path=$input_arg
else
  input_path="$repo_root/$DEFAULT_DIR/$input_arg"
fi

if [[ ! -f "$input_path" ]]; then
  echo "입력 파일을 찾을 수 없습니다: $input_path" >&2
  exit 1
fi

# 비율이 어긋난 원본은 굽고 나서야 알아채기 어렵다. 미리 재고 알린다.
dimensions=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0 "$input_path" 2>/dev/null || true)
width=${dimensions%%,*}
height=${dimensions##*,}

if [[ -n "$width" && -n "$height" ]]; then
  echo "원본 크기: ${width}x${height}"
  if (( width * 3 != height * 2 )); then
    echo "경고: 2:3이 아닙니다. 로비에서 눌려 보입니다 (권장 720x1080)." >&2
  elif (( height < 1080 )); then
    echo "참고: 1080p 전체화면에서 $(( 1080 * 100 / height ))% 로 확대됩니다." >&2
  fi
fi

stem=${input_path%.*}
output_path="${stem}_pingpong.webm"

ffmpeg -hide_banner -y \
  -i "$input_path" \
  -filter_complex \
  '[0:v:0]chromakey=0x00FF00:0.35:0,format=rgba,split[f][r];[r]reverse[r];[f][r]concat=n=2:v=1:a=0[out]' \
  -map '[out]' \
  -an \
  -c:v libvpx-vp9 \
  -pix_fmt yuva420p \
  -metadata:s:v:0 alpha_mode=1 \
  -auto-alt-ref 0 \
  -b:v 0 \
  -crf "$crf" \
  -deadline good \
  -cpu-used 2 \
  -row-mt 1 \
  "$output_path"

echo "생성 완료: $output_path"
ls -lh "$output_path" | awk '{ print "용량: " $5 }'
