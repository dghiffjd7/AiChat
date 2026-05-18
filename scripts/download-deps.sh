#!/bin/bash

# 下载依赖脚本

echo "📦 开始下载前端依赖..."

# 创建目录
mkdir -p src/lib
mkdir -p src/assets/css
mkdir -p src/vendor/fontawesome/6.0.0-beta3/css
mkdir -p src/vendor/fontawesome/6.0.0-beta3/webfonts

download_with_fallback() {
    local output="$1"
    shift
    local urls=("$@")
    for u in "${urls[@]}"; do
        [ -z "$u" ] && continue
        curl -fL -o "$output" "$u" && return 0
    done
    return 1
}

# 下载 jQuery
echo "⬇️  下载 jQuery..."
curl -L -o src/lib/jquery.min.js https://code.jquery.com/jquery-3.7.1.min.js
if [ $? -eq 0 ]; then
    echo "✅ jQuery 下载完成"
else
    echo "❌ jQuery 下载失败"
fi

# 下载 Toastr
echo "⬇️  下载 Toastr..."
curl -L -o src/lib/toastr.min.js https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.js
curl -L -o src/assets/css/toastr.min.css https://cdnjs.cloudflare.com/ajax/libs/toastr.js/2.1.4/toastr.min.css
if [ $? -eq 0 ]; then
    echo "✅ Toastr 下载完成"
else
    echo "❌ Toastr 下载失败"
fi

# 下载 Font Awesome Free（iframe 角色卡 CDN 兼容，本地同源兜底）
echo "⬇️  下载 Font Awesome Free 6.0.0-beta3..."
download_with_fallback src/vendor/fontawesome/6.0.0-beta3/css/all.min.css \
    https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css \
    https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.0.0-beta3/css/all.min.css \
    https://unpkg.com/@fortawesome/fontawesome-free@6.0.0-beta3/css/all.min.css
fa_status=$?
for font in fa-brands-400 fa-regular-400 fa-solid-900 fa-v4compatibility; do
    download_with_fallback "src/vendor/fontawesome/6.0.0-beta3/webfonts/${font}.woff2" \
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/${font}.woff2" \
        "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.0.0-beta3/webfonts/${font}.woff2" \
        "https://unpkg.com/@fortawesome/fontawesome-free@6.0.0-beta3/webfonts/${font}.woff2"
    if [ $? -ne 0 ]; then
        fa_status=1
    fi
done
if [ $fa_status -eq 0 ]; then
    echo "✅ Font Awesome 下载完成"
else
    echo "❌ Font Awesome 下载失败"
fi

# 下载 Lodash
echo "⬇️  下载 Lodash..."
download_with_fallback src/lib/lodash.min.js \
    https://testingcf.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js \
    https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js
if [ $? -eq 0 ]; then
    echo "✅ Lodash 下载完成"
else
    echo "❌ Lodash 下载失败"
fi

# 下载 Zod
echo "⬇️  下载 Zod..."
download_with_fallback src/lib/zod.min.js \
    https://testingcf.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js \
    https://cdn.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js
if [ $? -eq 0 ]; then
    echo "✅ Zod 下载完成"
else
    echo "❌ Zod 下载失败"
fi

# 下载 Vue / Vue Router / Pinia（用于复杂 MVU 卡离线兜底）
echo "⬇️  下载 Vue3..."
download_with_fallback src/lib/vue3.global.prod.js \
    https://testingcf.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js \
    https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js \
    https://unpkg.com/vue@3/dist/vue.global.prod.js
if [ $? -eq 0 ]; then
    echo "✅ Vue3 下载完成"
else
    echo "❌ Vue3 下载失败"
fi

echo "⬇️  下载 Vue2..."
download_with_fallback src/lib/vue2.min.js \
    https://testingcf.jsdelivr.net/npm/vue@2/dist/vue.min.js \
    https://cdn.jsdelivr.net/npm/vue@2/dist/vue.min.js \
    https://unpkg.com/vue@2/dist/vue.min.js
if [ $? -eq 0 ]; then
    echo "✅ Vue2 下载完成"
else
    echo "❌ Vue2 下载失败"
fi

echo "⬇️  下载 Vue Router 4..."
download_with_fallback src/lib/vue-router4.global.prod.js \
    https://testingcf.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.prod.js \
    https://cdn.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.prod.js \
    https://unpkg.com/vue-router@4/dist/vue-router.global.prod.js
if [ $? -eq 0 ]; then
    echo "✅ Vue Router 4 下载完成"
else
    echo "❌ Vue Router 4 下载失败"
fi

echo "⬇️  下载 Vue Router 3..."
download_with_fallback src/lib/vue-router3.min.js \
    https://testingcf.jsdelivr.net/npm/vue-router@3/dist/vue-router.min.js \
    https://cdn.jsdelivr.net/npm/vue-router@3/dist/vue-router.min.js \
    https://unpkg.com/vue-router@3/dist/vue-router.min.js
if [ $? -eq 0 ]; then
    echo "✅ Vue Router 3 下载完成"
else
    echo "❌ Vue Router 3 下载失败"
fi

echo "⬇️  下载 Pinia..."
download_with_fallback src/lib/pinia.iife.prod.js \
    https://testingcf.jsdelivr.net/npm/pinia@2/dist/pinia.iife.prod.js \
    https://cdn.jsdelivr.net/npm/pinia@2/dist/pinia.iife.prod.js \
    https://unpkg.com/pinia@2/dist/pinia.iife.prod.js
if [ $? -eq 0 ]; then
    echo "✅ Pinia 下载完成"
else
    echo "❌ Pinia 下载失败"
fi

# 下载外部 CSS（如果需要）
# echo "⬇️  下载外部 CSS..."
# curl -L -o src/assets/css/result.css https://static.zeoseven.com/zsft/59/main/result.css

echo ""
echo "✅ 所有依赖下载完成！"
echo ""
echo "📝 提示："
echo "   - 依赖文件已保存到 src/lib/ 和 src/assets/css/"
echo "   - 请确保在 HTML 中使用相对路径引用这些文件"
echo ""
