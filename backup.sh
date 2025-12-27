#!/bin/bash

# 获取当前时间戳，格式：YYYYMMDD_HHMMSS
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# 定义备份目录名
BACKUP_DIR="_backups/backup_${TIMESTAMP}"

# 创建目录
mkdir -p "$BACKUP_DIR"

# 定义要备份的核心文件
FILES=("index.html" "map.html" "panorama.html" "history_data.csv" "china.json")

# 复制文件
echo "正在创建备份: $BACKUP_DIR ..."
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        echo "  - 已备份: $file"
    else
        echo "  - 警告: $file 不存在，跳过"
    fi
done

echo "备份完成！✅"
