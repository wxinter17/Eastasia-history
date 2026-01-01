#!/bin/bash

# 获取当前时间戳，格式：YYYYMMDD_HHMMSS
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 定义备份目录名
BACKUP_DIR="_backups/backup_${TIMESTAMP}"

# 创建目录
mkdir -p "$BACKUP_DIR"

# 定义要备份的核心文件
FILES=("index.html" "map.html" "panorama.html" "history_data.csv" "china.json" "LayoutOptimizer.html" "layout.json")

# 复制文件
echo "正在创建本地备份: $BACKUP_DIR ..."
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        echo "  - 已备份: $file"
    else
        echo "  - 警告: $file 不存在，跳过"
    fi
done

echo "本地备份完成！✅"

# Git 备份逻辑
COMMIT_MSG="$1"
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Backup ${TIMESTAMP}"
fi

echo "正在执行 Git 备份..."
git add .
git commit -m "$COMMIT_MSG"

# 获取当前分支名
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo "推送到远程分支: $CURRENT_BRANCH ..."
git push origin "$CURRENT_BRANCH"

echo "Git 备份完成！🚀"

