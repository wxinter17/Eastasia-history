#!/bin/bash

# =======================================================
# 东亚历史地图 - 开发工具箱 v3.0
# 功能：版本管理 | 备份 | 本地服务器 | 项目管理
# =======================================================

# 定义颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 定义目标文件数组 (索引从1开始对应)
FILE_NAMES=("DUMMY" "东亚历史交互地图" "地图页" "全景页" "布局优化器")
FILE_PATHS=("DUMMY" "index.html" "map.html" "panorama.html" "LayoutOptimizer.html")

# 切换到脚本所在目录
cd "$(dirname "$0")"

# ============== 工具函数 ==============

check_files() {
    local missing=0
    for i in 1 2 3 4; do
        if [[ ! -f "${FILE_PATHS[$i]}" ]]; then
            echo -e "${RED}警告: 找不到文件 ${FILE_PATHS[$i]}${NC}"
            missing=1
        fi
    done
    return $missing
}

get_git_status() {
    local file=$1
    if git diff --quiet -- "$file" 2>/dev/null; then
        if git diff --cached --quiet -- "$file" 2>/dev/null; then
            echo ""
        else
            echo -e "${YELLOW}[已暂存]${NC}"
        fi
    else
        echo -e "${MAGENTA}[已修改]${NC}"
    fi
}

get_change_stats() {
    local file=$1
    local stats=$(git diff --stat -- "$file" 2>/dev/null | tail -1 | grep -o '[0-9]\+ insertion\|[0-9]\+ deletion' | grep -o '[0-9]\+' | paste -sd'+' | bc 2>/dev/null)
    if [[ -n "$stats" && "$stats" -gt 0 ]]; then
        echo -e "${CYAN}(±$stats)${NC}"
    fi
}

# ============== 版本管理 ==============

update_version() {
    local file_index=$1
    local mode=$2
    local target_file="${FILE_PATHS[$file_index]}"
    local today=$(date +"%Y.%m.%d")

    if [[ ! -f "$target_file" ]]; then
        echo -e "${RED}跳过: $target_file 不存在${NC}"
        return
    fi

    echo -e "${BLUE}正在处理: $target_file ...${NC}"

    # 1. 处理 Title 版本号
    if [[ "$mode" == "major" ]]; then
        perl -i -pe 's/(<title>.*\s+v)(\d+)\.(\d+)(<\/title>)/
            my $maj = $2 + 1;
            sprintf("${1}%d.00${4}", $maj)
        /ge' "$target_file"
    else
        perl -i -pe 's/(<title>.*\s+v)(\d+)\.(\d+)(<\/title>)/
            my $maj = $2;
            my $min = $3 + 1;
            sprintf("${1}%d.%02d${4}", $maj, $min)
        /ge' "$target_file"
    fi

    # 2. 处理 APP_VERSION (跨天重置为001)
    perl -i -pe 'BEGIN { $today = "'"$today"'"; }
        s/(APP_VERSION\s*=\s*'"'"')(\d{4}\.\d{2}\.\d{2})\.(\d{3})('"'"')/
            my $old_date = $2;
            my $old_count = int($3);
            my $new_count = ($old_date eq $today) ? $old_count + 1 : 1;
            sprintf("${1}%s.%03d${4}", $today, $new_count)
        /ge' "$target_file"

    local new_title_ver=$(grep -o 'v[0-9]\+\.[0-9]\+' "$target_file" | head -1)
    local new_app_ver=$(grep -o "APP_VERSION.*'" "$target_file" | head -1 | grep -o "'[^']*'" | tr -d "'")
    echo -e "${GREEN}  └─ $new_title_ver | $new_app_ver${NC}"
}

select_files_and_update() {
    local mode=$1
    local mode_name="小升级"
    [[ "$mode" == "major" ]] && mode_name="大升级"
    
    echo -e "\n${YELLOW}【$mode_name】请选择要升级的文件:${NC}\n"
    
    for i in 1 2 3 4; do
        local file="${FILE_PATHS[$i]}"
        local name="${FILE_NAMES[$i]}"
        local ver=$(grep -o 'v[0-9]\+\.[0-9]\+' "$file" 2>/dev/null | head -1 || echo 'N/A')
        printf "  %d. %-18s %s %s %s\n" "$i" "$name" "$ver" "$(get_git_status "$file")" "$(get_change_stats "$file")"
    done
    
    echo -e "  ${CYAN}a. 全部${NC}\n"
    read -p "输入选择 > " selections

    [[ "$selections" == "a" || "$selections" == "A" ]] && selections="1 2 3 4"

    local updated=0
    for idx in $selections; do
        [[ "$idx" =~ ^[1-4]$ ]] && { update_version $idx "$mode"; updated=1; }
    done

    if [[ $updated -eq 1 ]]; then
        echo -e "\n${BLUE}是否立即备份? (y/n)${NC}"
        read -p "> " do_backup
        [[ "$do_backup" == "y" || "$do_backup" == "Y" ]] && run_backup "版本升级"
    fi
}

# ============== 备份功能 ==============

run_backup() {
    local commit_msg="${1:-Backup}"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_dir="_backups/backup_${timestamp}"

    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}   🗂️  执行备份流程${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"

    # 本地备份
    echo -e "\n${BLUE}[1/3] 本地备份 → $backup_dir${NC}"
    mkdir -p "$backup_dir"
    for file in index.html map.html panorama.html LayoutOptimizer.html history_data.csv china.json layout.json layout-worker.js; do
        [[ -f "$file" ]] && { cp "$file" "$backup_dir/"; echo -e "  ${GREEN}✓${NC} $file"; }
    done

    # Git 提交
    echo -e "\n${BLUE}[2/3] Git 提交${NC}"
    git add .
    local changes=$(git diff --cached --stat | tail -1)
    if [[ -n "$changes" && "$changes" != *"0 files"* ]]; then
        git commit -m "$commit_msg - $timestamp"
        echo -e "  ${GREEN}✓${NC} 已提交"
    else
        echo -e "  ${YELLOW}⚠${NC} 无变更"
    fi

    # 推送
    echo -e "\n${BLUE}[3/3] 推送到 GitHub${NC}"
    if git push origin $(git symbolic-ref --short HEAD 2>/dev/null || echo "main") 2>&1; then
        echo -e "  ${GREEN}✓${NC} 推送成功"
    else
        echo -e "  ${RED}✗${NC} 推送失败"
    fi

    echo -e "\n${GREEN}🚀 备份完成！${NC}"
}

# ============== 本地服务器 ==============

start_server() {
    local port=${1:-8000}
    
    # 检查端口是否被占用
    if lsof -i :$port >/dev/null 2>&1; then
        echo -e "${YELLOW}端口 $port 已被占用${NC}"
        echo -e "现有进程:"
        lsof -i :$port | head -5
        echo ""
        read -p "是否终止现有进程并重启? (y/n) > " kill_existing
        if [[ "$kill_existing" == "y" || "$kill_existing" == "Y" ]]; then
            lsof -ti :$port | xargs kill -9 2>/dev/null
            echo -e "${GREEN}已终止现有进程${NC}"
            sleep 1
        else
            return
        fi
    fi

    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}   🌐 启动本地开发服务器${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "\n${GREEN}服务器地址: ${BOLD}http://localhost:$port${NC}"
    echo -e "${YELLOW}按 Ctrl+C 停止服务器${NC}\n"

    # 自动打开浏览器
    sleep 1 && open "http://localhost:$port" &

    # 启动服务器
    python3 -m http.server $port
}

# ============== 其他工具 ==============

show_git_log() {
    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}   📜 最近 10 条提交记录${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}\n"
    git log --oneline --decorate -n 10
    echo ""
}

open_in_finder() {
    open .
    echo -e "${GREEN}✓ 已在 Finder 中打开项目文件夹${NC}"
}

clean_old_backups() {
    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}   🗑️  备份管理${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    
    # 检查备份目录
    if [[ ! -d "_backups" ]]; then
        echo -e "\n${YELLOW}备份目录不存在${NC}"
        return
    fi
    
    # 获取备份列表
    local backups=($(ls -dt _backups/backup_* 2>/dev/null))
    local count=${#backups[@]}
    
    if [[ $count -eq 0 ]]; then
        echo -e "\n${YELLOW}没有找到备份${NC}"
        return
    fi
    
    # 显示备份列表
    echo -e "\n${BLUE}当前备份 ($count 个):${NC}"
    echo -e "────────────────────────────────────────────────"
    printf "  ${BOLD}%-4s  %-20s  %10s${NC}\n" "序号" "备份时间" "大小"
    echo -e "────────────────────────────────────────────────"
    
    local i=1
    for backup in "${backups[@]}"; do
        local name=$(basename "$backup")
        local timestamp=${name#backup_}
        # 格式化时间戳: 20260107_011630 -> 2026-01-07 01:16:30
        local formatted="${timestamp:0:4}-${timestamp:4:2}-${timestamp:6:2} ${timestamp:9:2}:${timestamp:11:2}"
        local size=$(du -sh "$backup" 2>/dev/null | cut -f1)
        printf "  %-4s  %-20s  %10s\n" "$i." "$formatted" "$size"
        ((i++))
    done
    
    # 子菜单
    echo -e "\n${YELLOW}操作选项:${NC}"
    echo "  1. 保留最近 N 个，删除其余"
    echo "  2. 删除超过 N 天的备份"
    echo "  3. 删除指定备份"
    echo "  4. 删除所有备份"
    echo "  b. 返回"
    echo ""
    read -p "选择操作 > " action
    
    case $action in
        1)
            read -p "保留最近多少个备份? (默认5) > " keep_count
            keep_count=${keep_count:-5}
            if [[ $count -le $keep_count ]]; then
                echo -e "${GREEN}当前只有 $count 个备份，无需清理${NC}"
            else
                local to_delete=$((count - keep_count))
                echo -e "\n${YELLOW}将删除 $to_delete 个旧备份，保留最近 $keep_count 个${NC}"
                read -p "确认? (y/n) > " confirm
                if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
                    ls -dt _backups/backup_* | tail -n +$((keep_count + 1)) | xargs rm -rf
                    echo -e "${GREEN}✓ 已删除 $to_delete 个备份${NC}"
                fi
            fi
            ;;
        2)
            read -p "删除多少天前的备份? (默认7) > " days
            days=${days:-7}
            local old_backups=$(find _backups -maxdepth 1 -type d -name "backup_*" -mtime +$days 2>/dev/null)
            local old_count=$(echo "$old_backups" | grep -c "backup_" || echo 0)
            if [[ $old_count -eq 0 ]]; then
                echo -e "${GREEN}没有超过 $days 天的备份${NC}"
            else
                echo -e "\n${YELLOW}找到 $old_count 个超过 $days 天的备份${NC}"
                read -p "确认删除? (y/n) > " confirm
                if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
                    echo "$old_backups" | xargs rm -rf
                    echo -e "${GREEN}✓ 已删除 $old_count 个备份${NC}"
                fi
            fi
            ;;
        3)
            read -p "输入要删除的备份序号 (空格分隔) > " indices
            for idx in $indices; do
                if [[ "$idx" =~ ^[0-9]+$ ]] && [[ $idx -ge 1 ]] && [[ $idx -le $count ]]; then
                    local target="${backups[$((idx-1))]}"
                    rm -rf "$target"
                    echo -e "${GREEN}✓ 已删除: $(basename "$target")${NC}"
                else
                    echo -e "${RED}无效序号: $idx${NC}"
                fi
            done
            ;;
        4)
            echo -e "\n${RED}警告: 这将删除所有备份！${NC}"
            read -p "输入 'DELETE ALL' 确认 > " confirm
            if [[ "$confirm" == "DELETE ALL" ]]; then
                rm -rf _backups/backup_*
                echo -e "${GREEN}✓ 已删除所有备份${NC}"
            else
                echo -e "${YELLOW}操作已取消${NC}"
            fi
            ;;
        b|B)
            return
            ;;
        *)
            echo -e "${YELLOW}已取消${NC}"
            ;;
    esac
}

show_project_stats() {
    echo -e "\n${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}   📊 项目统计${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}\n"
    
    echo -e "${BLUE}文件大小:${NC}"
    for file in index.html map.html panorama.html LayoutOptimizer.html; do
        if [[ -f "$file" ]]; then
            local size=$(ls -lh "$file" | awk '{print $5}')
            local lines=$(wc -l < "$file" | tr -d ' ')
            printf "  %-25s %8s  %6s 行\n" "$file" "$size" "$lines"
        fi
    done
    
    echo -e "\n${BLUE}备份数量:${NC} $(find _backups -maxdepth 1 -type d -name "backup_*" 2>/dev/null | wc -l | tr -d ' ') 个"
    echo -e "${BLUE}Git 分支:${NC} $(git symbolic-ref --short HEAD 2>/dev/null || echo 'N/A')"
    echo ""
}

show_status() {
    echo -e "\n${BLUE}📊 版本状态:${NC}"
    echo -e "────────────────────────────────────────────────────"
    printf "  ${BOLD}%-18s  %-8s  %-16s  %s${NC}\n" "模块" "版本" "APP_VERSION" "状态"
    echo -e "────────────────────────────────────────────────────"
    
    for i in 1 2 3 4; do
        local file="${FILE_PATHS[$i]}"
        local name="${FILE_NAMES[$i]}"
        local title_ver=$(grep -o 'v[0-9]\+\.[0-9]\+' "$file" 2>/dev/null | head -1 || echo 'N/A')
        local app_ver=$(grep -o "APP_VERSION.*'" "$file" 2>/dev/null | head -1 | grep -o "'[^']*'" | tr -d "'" || echo 'N/A')
        printf "  %-18s  ${GREEN}%-8s${NC}  ${BLUE}%-16s${NC}  %s %s\n" "$name" "$title_ver" "$app_ver" "$(get_git_status "$file")" "$(get_change_stats "$file")"
    done
}

# ============== 主程序 ==============

check_files

while true; do
    clear
    echo -e "${CYAN}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     📦 东亚历史地图 - 开发工具箱                  ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════╝${NC}"
    
    show_status
    
    echo -e "\n${YELLOW}操作菜单:${NC}"
    echo -e "  ${BOLD}版本管理${NC}"
    echo "    1. 🔼 大升级 (vX+1.00)"
    echo "    2. 🔽 小升级 (vX.Y+1)"
    echo "    3. 💾 备份 (本地+Git+Push)"
    echo -e "  ${BOLD}开发工具${NC}"
    echo "    4. 🌐 启动本地服务器"
    echo "    5. 📂 打开项目文件夹"
    echo "    6. 📜 查看 Git 日志"
    echo -e "  ${BOLD}维护工具${NC}"
    echo "    7. 📊 项目统计"
    echo "    8. 🗑️  清理旧备份"
    echo ""
    echo "    q. 退出"
    echo -e "────────────────────────────────────────"
    read -p "请选择 > " choice

    case $choice in
        1) select_files_and_update "major" ;;
        2) select_files_and_update "minor" ;;
        3) 
            echo -e "\n${YELLOW}输入备份说明 (可选):${NC}"
            read -p "> " msg
            run_backup "${msg:-Manual Backup}"
            ;;
        4) start_server 8000 ;;
        5) open_in_finder ;;
        6) show_git_log; read -p "按回车继续..." ;;
        7) show_project_stats; read -p "按回车继续..." ;;
        8) clean_old_backups; read -p "按回车继续..." ;;
        q|Q) echo -e "\n${GREEN}再见！${NC}"; exit 0 ;;
        *) echo -e "${RED}无效选项${NC}"; sleep 1 ;;
    esac
done
