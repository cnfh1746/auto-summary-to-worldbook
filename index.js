import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { 
    loadWorldInfo, 
    createWorldInfoEntry, 
    saveWorldInfo,
    world_names 
} from "../../../world-info.js";
import { characters } from "../../../../script.js";
import { eventSource, event_types } from "../../../../script.js";

const extensionName = "auto-summary-to-worldbook";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// 默认设置
const defaultSettings = {
    enabled: false,
    target: "character_main",
    retentionCount: 5,
    
    // 小总结设置
    smallSummary: {
        autoEnabled: false,
        threshold: 20,
        interactive: true,
        prompt: `你是一个专业的对话总结助手。请仔细阅读以下对话记录，提取关键信息并生成简洁、准确的总结。

总结要求：
1. 保留重要的剧情发展和角色互动
2. 记录关键的情感变化和决策
3. 简明扼要，避免冗余
4. 使用第三人称叙述
5. 保持客观中立的语气

请基于对话内容生成总结。`
    },
    
    // 大总结设置
    largeSummary: {
        prompt: `你是一个专业的内容精炼助手。你将收到多个零散的详细总结记录，请将它们提炼并融合成一段连贯、精简的章节历史。

精炼要求：
1. 保留所有关键剧情点和重要事件
2. 合并重复或相似的信息
3. 使用流畅的叙事结构
4. 突出重要的转折点和高潮
5. 压缩细节但保留核心内容
6. 保持时间线的清晰和连贯

请将以下多个总结记录精炼成一个完整的章节。`
    },
    
    // 标签提取
    tagExtraction: {
        enabled: false,
        tags: ""
    },
    
    // 排除规则
    exclusion: {
        enabled: false,
        rules: [
            { start: "<!--", end: "-->" }
        ]
    },
    
    // 向量化
    vectorization: {
        enabled: false
    },
    
    // 世界书条目设置
    lore: {
        activationMode: "constant",
        keywords: "剧情, 总结, 历史",
        insertionPosition: 2,
        depth: 4
    },
    
    // API设置
    api: {
        url: "",
        key: "",
        model: ""
    }
};

const SUMMARY_COMMENT = "【自动总结】对话历史总结";
const PROGRESS_SEAL_REGEX = /本条勿动【前(\d+)楼总结已完成】否则后续总结无法进行。$/;

// 工具函数：标签提取
function extractBlocksByTags(text, tags) {
    if (!text || !tags || tags.length === 0) return [];
    
    const blocks = [];
    tags.forEach(tag => {
        const tagName = tag.trim();
        if (tagName) {
            const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'g');
            const matches = text.match(regex);
            if (matches) {
                blocks.push(...matches);
            }
        }
    });
    
    return blocks;
}

// 工具函数：应用排除规则
function applyExclusionRules(text, rules) {
    if (!text || !rules || rules.length === 0) return text;
    
    let result = text;
    rules.forEach(rule => {
        if (rule.start && rule.end) {
            const startEscaped = rule.start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const endEscaped = rule.end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(startEscaped + '[\\s\\S]*?' + endEscaped, 'g');
            while (regex.test(result)) {
                result = result.replace(regex, '');
            }
        }
    });
    
    return result;
}

// 读取已总结的进度
async function readSummaryProgress(lorebookName) {
    console.log('[自动总结-调试] readSummaryProgress 开始, 世界书名:', lorebookName);
    
    if (!lorebookName) {
        console.log('[自动总结-调试] 世界书名为空，返回0');
        return 0;
    }
    
    try {
        const bookData = await loadWorldInfo(lorebookName);
        console.log('[自动总结-调试] 成功加载世界书数据');
        console.log('[自动总结-调试] bookData.entries 存在:', !!bookData?.entries);
        
        if (!bookData || !bookData.entries) {
            console.log('[自动总结-调试] 世界书数据或条目为空，返回0');
            return 0;
        }
        
        const allEntries = Object.values(bookData.entries);
        console.log('[自动总结-调试] 世界书总条目数:', allEntries.length);
        console.log('[自动总结-调试] 所有条目的comment:', allEntries.map(e => e.comment));
        
        // 列出所有条目的详细信息
        console.log('[自动总结-调试] ===== 所有条目详细信息 =====');
        allEntries.forEach((entry, index) => {
            console.log(`[自动总结-调试] 条目${index + 1}:`, {
                comment: entry.comment,
                key: entry.key,
                disable: entry.disable,
                constant: entry.constant,
                contentLength: entry.content?.length || 0,
                contentPreview: entry.content?.substring(0, 50)
            });
        });
        console.log('[自动总结-调试] ===== 条目列表结束 =====');
        
        const summaryEntry = allEntries.find(
            e => e.comment === SUMMARY_COMMENT && !e.disable
        );
        
        if (!summaryEntry) {
            console.log('[自动总结-调试] 未找到总结条目（comment=【自动总结】对话历史总结），返回0');
            return 0;
        }
        
        console.log('[自动总结-调试] 找到总结条目');
        console.log('[自动总结-调试] 条目内容长度:', summaryEntry.content?.length || 0);
        console.log('[自动总结-调试] 条目内容前100字符:', summaryEntry.content?.substring(0, 100));
        
        const match = summaryEntry.content.match(PROGRESS_SEAL_REGEX);
        console.log('[自动总结-调试] 进度封印匹配结果:', match);
        
        const progress = match ? parseInt(match[1], 10) : 0;
        console.log('[自动总结-调试] 返回进度:', progress);
        
        return progress;
    } catch (error) {
        console.error('[自动总结-调试] 读取进度失败:', error);
        console.error('[自动总结-调试] 错误堆栈:', error.stack);
        return 0;
    }
}

// 获取目标世界书名称
async function getTargetLorebookName() {
    const settings = extension_settings[extensionName];
    const context = getContext();
    
    if (settings.target === "character_main") {
        const worldbook = characters[context.characterId]?.data?.extensions?.world;
        if (!worldbook) {
            throw new Error("当前角色未绑定主世界书");
        }
        return worldbook;
    } else {
        // 使用专用世界书
        const chatId = context.chatId || "unknown";
        return `AutoSummary-${chatId}`;
    }
}

// 获取未总结的消息
function getUnsummarizedMessages(startFloor, endFloor) {
    const context = getContext();
    const settings = extension_settings[extensionName];
    const chat = context.chat;
    
    if (!chat || chat.length === 0) return [];
    
    const historySlice = chat.slice(startFloor - 1, endFloor);
    if (historySlice.length === 0) return [];
    
    const userName = context.name1 || '用户';
    const characterName = context.name2 || '角色';
    
    const useTagExtraction = settings.tagExtraction.enabled;
    const tagsToExtract = useTagExtraction && settings.tagExtraction.tags 
        ? settings.tagExtraction.tags.split(',').map(t => t.trim()).filter(Boolean) 
        : [];
    const exclusionRules = settings.exclusion.enabled ? settings.exclusion.rules : [];
    
    const messages = historySlice.map((msg, index) => {
        let content = msg.mes;
        
        // 标签提取
        if (useTagExtraction && tagsToExtract.length > 0) {
            const blocks = extractBlocksByTags(content, tagsToExtract);
            if (blocks.length > 0) {
                content = blocks.join('\n\n');
            }
        }
        
        // 应用排除规则
        content = applyExclusionRules(content, exclusionRules);
        
        if (!content.trim()) return null;
        
        return {
            floor: startFloor + index,
            author: msg.is_user ? userName : characterName,
            authorType: msg.is_user ? 'user' : 'char',
            content: content.trim()
        };
    }).filter(Boolean);
    
    return messages;
}

// 调用AI生成总结
async function callAI(messages) {
    const settings = extension_settings[extensionName];
    const context = getContext();
    
    // 如果有自定义API设置，使用自定义API
    if (settings.api.url) {
        try {
            // 确保URL格式正确，避免重复拼接
            let apiUrl = settings.api.url.trim();
            if (!apiUrl.endsWith('/v1/chat/completions')) {
                if (apiUrl.endsWith('/')) {
                    apiUrl = apiUrl.slice(0, -1);
                }
                if (!apiUrl.includes('/v1/chat/completions')) {
                    apiUrl += '/v1/chat/completions';
                }
            }
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.api.key || ''}`
                },
                body: JSON.stringify({
                    model: settings.api.model || 'gpt-3.5-turbo',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 2000
                })
            });
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('[自动总结] API调用失败:', error);
            toastr.error(`API调用失败: ${error.message}`, '自动总结');
            return null;
        }
    }
    
    // 否则使用SillyTavern的默认API
    try {
        const generateRaw = window.generateRaw || window.Generate?.generateRaw;
        if (!generateRaw) {
            throw new Error('找不到SillyTavern的生成函数');
        }
        
        // 将消息格式转换为ST格式
        const prompt = messages.map(m => {
            if (m.role === 'system') return m.content;
            if (m.role === 'user') return m.content;
            return m.content;
        }).join('\n\n');
        
        const result = await generateRaw(prompt, '', false, false);
        return result;
    } catch (error) {
        console.error('[自动总结] 调用ST API失败:', error);
        toastr.error(`生成总结失败: ${error.message}`, '自动总结');
        return null;
    }
}

// 生成小总结
async function generateSmallSummary(startFloor, endFloor) {
    const settings = extension_settings[extensionName];
    const messages = getUnsummarizedMessages(startFloor, endFloor);
    
    if (messages.length === 0) {
        toastr.warning('选定范围内没有有效消息', '自动总结');
        return null;
    }
    
    const formattedHistory = messages
        .map(m => `【第 ${m.floor} 楼】 ${m.author}: ${m.content}`)
        .join('\n');
    
    // 调试输出：显示发送给AI的完整内容
    console.log('[自动总结-调试] ========== 发送给AI的内容 ==========');
    console.log('[自动总结-调试] 总结范围:', startFloor, '至', endFloor, '楼');
    console.log('[自动总结-调试] 提取到的消息数:', messages.length);
    console.log('[自动总结-调试] 系统提示词:');
    console.log(settings.smallSummary.prompt);
    console.log('[自动总结-调试] ----------');
    console.log('[自动总结-调试] 用户消息（对话记录）:');
    console.log(formattedHistory);
    console.log('[自动总结-调试] 对话记录总字符数:', formattedHistory.length);
    console.log('[自动总结-调试] ==========================================');
    
    const aiMessages = [
        { role: 'system', content: settings.smallSummary.prompt },
        { role: 'user', content: `请严格根据以下"对话记录"中的内容进行总结，不要添加任何额外信息。\n\n<对话记录>\n${formattedHistory}\n</对话记录>` }
    ];
    
    toastr.info('正在生成总结...', '自动总结');
    const summary = await callAI(aiMessages);
    
    if (!summary) {
        toastr.error('生成总结失败', '自动总结');
        return null;
    }
    
    return summary;
}

// 写入总结到世界书
async function writeSummaryToLorebook(summary, startFloor, endFloor) {
    const settings = extension_settings[extensionName];
    
    try {
        const lorebookName = await getTargetLorebookName();
        
        // 加载或创建世界书
        let bookData;
        try {
            bookData = await loadWorldInfo(lorebookName);
        } catch (error) {
            // 世界书不存在，创建新的
            console.log(`[自动总结] 创建新世界书: ${lorebookName}`);
            bookData = {
                entries: {},
                name: lorebookName
            };
        }
        
        if (!bookData.entries) {
            bookData.entries = {};
        }
        
        // 查找现有的总结条目
        let summaryEntry = Object.values(bookData.entries).find(
            e => e.comment === SUMMARY_COMMENT && !e.disable
        );
        
        const newSeal = `\n\n本条勿动【前${endFloor}楼总结已完成】否则后续总结无法进行。`;
        const newChapter = `\n\n---\n\n【${startFloor}楼至${endFloor}楼详细总结记录】\n${summary}`;
        
        if (summaryEntry) {
            // 更新现有条目
            const contentWithoutSeal = summaryEntry.content.replace(PROGRESS_SEAL_REGEX, "").trim();
            summaryEntry.content = contentWithoutSeal + newChapter + newSeal;
        } else {
            // 创建新条目 - 不使用createWorldInfoEntry，直接创建对象避免重复
            const entryKey = Date.now().toString();
            const keywords = settings.lore.keywords.split(',').map(k => k.trim()).filter(Boolean);
            const isConstant = settings.lore.activationMode === 'constant';
            
            summaryEntry = {
                uid: entryKey,
                key: keywords,
                keysecondary: [],
                comment: SUMMARY_COMMENT,
                content: `以下是依照顺序已发生剧情` + newChapter + newSeal,
                constant: isConstant,
                selective: !isConstant,
                selectiveLogic: 0,
                addMemo: false,
                order: 100,
                position: parseInt(settings.lore.insertionPosition) || 0,
                disable: false,
                excludeRecursion: false,
                preventRecursion: false,
                delayUntilRecursion: false,
                probability: 100,
                useProbability: true,
                depth: parseInt(settings.lore.depth) || 4,
                group: '',
                groupOverride: false,
                groupWeight: 100,
                scanDepth: null,
                caseSensitive: false,
                matchWholeWords: false,
                useGroupScoring: false,
                automationId: '',
                role: 0,
                vectorized: false,
                sticky: 0,
                cooldown: 0,
                delay: 0
            };
            
            bookData.entries[entryKey] = summaryEntry;
        }
        
        // 保存世界书
        await saveWorldInfo(lorebookName, bookData, true);
        
        toastr.success(`总结已写入世界书 ${lorebookName}`, '自动总结');
        return true;
    } catch (error) {
        console.error('[自动总结] 写入世界书失败:', error);
        toastr.error(`写入失败: ${error.message}`, '自动总结');
        return false;
    }
}

// 显示总结确认对话框
function showSummaryModal(summary, callbacks) {
    const modal = $('<div class="auto-summary-modal"></div>');
    const modalContent = $(`
        <div class="auto-summary-modal-content">
            <div class="auto-summary-modal-header">
                <h2>📝 总结预览</h2>
            </div>
            <div class="auto-summary-modal-body">
                <textarea class="summary-textarea">${summary}</textarea>
            </div>
            <div class="auto-summary-modal-footer">
                <button class="auto-summary-btn" id="summary-regenerate">🔄 重新生成</button>
                <button class="auto-summary-btn success" id="summary-confirm">✓ 确认保存</button>
                <button class="auto-summary-btn danger" id="summary-cancel">✗ 取消</button>
            </div>
        </div>
    `);
    
    modal.append(modalContent);
    $('body').append(modal);
    
    modal.find('#summary-confirm').on('click', async function() {
        const editedSummary = modal.find('.summary-textarea').val();
        modal.remove();
        if (callbacks.onConfirm) {
            await callbacks.onConfirm(editedSummary);
        }
    });
    
    modal.find('#summary-regenerate').on('click', async function() {
        modal.find('.summary-textarea').prop('disabled', true).val('正在重新生成...');
        if (callbacks.onRegenerate) {
            await callbacks.onRegenerate(modal);
        }
    });
    
    modal.find('#summary-cancel').on('click', function() {
        modal.remove();
        if (callbacks.onCancel) {
            callbacks.onCancel();
        }
    });
    
    // 点击背景关闭
    modal.on('click', function(e) {
        if (e.target === modal[0]) {
            modal.remove();
            if (callbacks.onCancel) {
                callbacks.onCancel();
            }
        }
    });
}

// 执行小总结
async function executeSmallSummary(startFloor, endFloor, autoMode = false) {
    const settings = extension_settings[extensionName];
    
    const summary = await generateSmallSummary(startFloor, endFloor);
    if (!summary) return false;
    
    if (autoMode && !settings.smallSummary.interactive) {
        // 完全自动模式，直接保存
        return await writeSummaryToLorebook(summary, startFloor, endFloor);
    }
    
    // 显示确认对话框
    return new Promise((resolve) => {
        showSummaryModal(summary, {
            onConfirm: async (editedSummary) => {
                const success = await writeSummaryToLorebook(editedSummary, startFloor, endFloor);
                resolve(success);
            },
            onRegenerate: async (modal) => {
                const newSummary = await generateSmallSummary(startFloor, endFloor);
                if (newSummary) {
                    modal.find('.summary-textarea').prop('disabled', false).val(newSummary);
                } else {
                    modal.find('.summary-textarea').prop('disabled', false).val(summary);
                    toastr.error('重新生成失败', '自动总结');
                }
            },
            onCancel: () => {
                toastr.info('总结已取消', '自动总结');
                resolve(false);
            }
        });
    });
}

// 执行大总结
async function executeLargeSummary() {
    const settings = extension_settings[extensionName];
    
    try {
        const lorebookName = await getTargetLorebookName();
        const bookData = await loadWorldInfo(lorebookName);
        
        if (!bookData || !bookData.entries) {
            toastr.error('未找到世界书', '自动总结');
            return false;
        }
        
        const summaryEntry = Object.values(bookData.entries).find(
            e => e.comment === SUMMARY_COMMENT && !e.disable
        );
        
        if (!summaryEntry) {
            toastr.error('未找到总结条目', '自动总结');
            return false;
        }
        
        const originalContent = summaryEntry.content;
        const progressMatch = originalContent.match(PROGRESS_SEAL_REGEX);
        
        if (!progressMatch) {
            toastr.error('总结条目格式不正确', '自动总结');
            return false;
        }
        
        const progressSeal = progressMatch[0];
        const contentToRefine = originalContent.replace(PROGRESS_SEAL_REGEX, '').trim();
        
        if (!contentToRefine) {
            toastr.warning('没有内容可供精炼', '自动总结');
            return false;
        }
        
        // 调用AI进行大总结
        const aiMessages = [
            { role: 'system', content: settings.largeSummary.prompt },
            { role: 'user', content: `请将以下多个零散的"详细总结记录"提炼并融合成一段连贯的章节历史。原文如下：\n\n${contentToRefine}` }
        ];
        
        toastr.info('正在生成大总结...', '自动总结');
        const refinedContent = await callAI(aiMessages);
        
        if (!refinedContent) {
            toastr.error('生成大总结失败', '自动总结');
            return false;
        }
        
        // 显示确认对话框
        return new Promise((resolve) => {
            showSummaryModal(refinedContent, {
                onConfirm: async (editedContent) => {
                    const totalFloors = parseInt(progressMatch[1], 10);
                    const header = `以下内容是【1楼-${totalFloors}楼】已发生的剧情回顾。\n\n---\n\n`;
                    const newContent = header + editedContent + `\n\n【前${totalFloors}楼篇章编撰已完成】\n\n` + progressSeal;
                    
                    summaryEntry.content = newContent;
                    await saveWorldInfo(lorebookName, bookData, true);
                    
                    toastr.success('大总结已完成', '自动总结');
                    resolve(true);
                },
                onRegenerate: async (modal) => {
                    modal.find('.summary-textarea').prop('disabled', true).val('正在重新生成...');
                    const newRefined = await callAI(aiMessages);
                    if (newRefined) {
                        modal.find('.summary-textarea').prop('disabled', false).val(newRefined);
                    } else {
                        modal.find('.summary-textarea').prop('disabled', false).val(refinedContent);
                        toastr.error('重新生成失败', '自动总结');
                    }
                },
                onCancel: () => {
                    toastr.info('大总结已取消', '自动总结');
                    resolve(false);
                }
            });
        });
    } catch (error) {
        console.error('[自动总结] 大总结失败:', error);
        toastr.error(`大总结失败: ${error.message}`, '自动总结');
        return false;
    }
}

// 检查并自动触发总结
async function checkAndAutoSummary() {
    const settings = extension_settings[extensionName];
    
    if (!settings.enabled || !settings.smallSummary.autoEnabled) {
        return;
    }
    
    try {
        const context = getContext();
        const lorebookName = await getTargetLorebookName();
        const summarizedCount = await readSummaryProgress(lorebookName);
        const currentChatLength = context.chat.length;
        const retentionCount = settings.retentionCount || 5;
        const summarizableLength = currentChatLength - retentionCount;
        const unsummarizedCount = summarizableLength - summarizedCount;
        
        if (unsummarizedCount >= settings.smallSummary.threshold) {
            const startFloor = summarizedCount + 1;
            const endFloor = Math.min(summarizedCount + settings.smallSummary.threshold, summarizableLength);
            
            console.log(`[自动总结] 自动触发: ${startFloor} 至 ${endFloor} 楼`);
            await executeSmallSummary(startFloor, endFloor, true);
        }
    } catch (error) {
        console.error('[自动总结] 自动检查失败:', error);
    }
}

// 更新状态显示
function updateStatus() {
    const settings = extension_settings[extensionName];
    const context = getContext();
    
    if (!context.chat) {
        $('#summary_status').html('未加载对话');
        return;
    }
    
    const statusHtml = `
        <strong>当前状态：</strong><br>
        • 功能状态: ${settings.enabled ? '✓ 已启用' : '✗ 未启用'}<br>
        • 自动小总结: ${settings.smallSummary.autoEnabled ? '✓ 已启用' : '✗ 未启用'}<br>
        • 当前对话长度: ${context.chat.length} 条消息<br>
        • 保留消息数: ${settings.retentionCount}<br>
        • 自动触发阈值: ${settings.smallSummary.threshold} 条
    `;
    
    $('#summary_status').html(statusHtml);
}

// 加载设置
function loadSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    
    const settings = extension_settings[extensionName];
    
    // 加载基础设置
    $('#auto_summary_enabled').prop('checked', settings.enabled);
    $('#auto_summary_target').val(settings.target);
    $('#auto_summary_retention_count').val(settings.retentionCount);
    
    // 加载小总结设置
    $('#small_summary_auto_enabled').prop('checked', settings.smallSummary.autoEnabled);
    $('#small_summary_threshold').val(settings.smallSummary.threshold);
    $('#small_summary_interactive').prop('checked', settings.smallSummary.interactive);
    $('#small_summary_prompt').val(settings.smallSummary.prompt);
    
    // 加载大总结设置
    $('#large_summary_prompt').val(settings.largeSummary.prompt);
    
    // 加载标签提取设置
    $('#tag_extraction_enabled').prop('checked', settings.tagExtraction.enabled);
    $('#extraction_tags').val(settings.tagExtraction.tags);
    
    // 加载排除规则设置
    $('#exclusion_enabled').prop('checked', settings.exclusion.enabled);
    renderExclusionRules();
    
    // 加载向量化设置
    $('#vectorization_enabled').prop('checked', settings.vectorization.enabled);
    
    // 加载世界书条目设置
    $('#lore_activation_mode').val(settings.lore.activationMode);
    $('#lore_keywords').val(settings.lore.keywords);
    $('#lore_insertion_position').val(settings.lore.insertionPosition);
    $('#lore_depth').val(settings.lore.depth);
    
    // 加载API设置
    $('#api_url').val(settings.api.url);
    $('#api_key').val(settings.api.key);
    $('#api_model').val(settings.api.model);
    
    updateStatus();
}

// 保存设置
function saveSettings() {
    const settings = extension_settings[extensionName];
    
    // 保存基础设置
    settings.enabled = $('#auto_summary_enabled').prop('checked');
    settings.target = $('#auto_summary_target').val();
    settings.retentionCount = parseInt($('#auto_summary_retention_count').val());
    
    // 保存小总结设置
    settings.smallSummary.autoEnabled = $('#small_summary_auto_enabled').prop('checked');
    settings.smallSummary.threshold = parseInt($('#small_summary_threshold').val());
    settings.smallSummary.interactive = $('#small_summary_interactive').prop('checked');
    settings.smallSummary.prompt = $('#small_summary_prompt').val();
    
    // 保存大总结设置
    settings.largeSummary.prompt = $('#large_summary_prompt').val();
    
    // 保存标签提取设置
    settings.tagExtraction.enabled = $('#tag_extraction_enabled').prop('checked');
    settings.tagExtraction.tags = $('#extraction_tags').val();
    
    // 保存排除规则设置
    settings.exclusion.enabled = $('#exclusion_enabled').prop('checked');
    
    // 保存向量化设置
    settings.vectorization.enabled = $('#vectorization_enabled').prop('checked');
    
    // 保存世界书条目设置
    settings.lore.activationMode = $('#lore_activation_mode').val();
    settings.lore.keywords = $('#lore_keywords').val();
    settings.lore.insertionPosition = parseInt($('#lore_insertion_position').val());
    settings.lore.depth = parseInt($('#lore_depth').val());
    
    // 保存API设置
    settings.api.url = $('#api_url').val();
    settings.api.key = $('#api_key').val();
    settings.api.model = $('#api_model').val();
    
    saveSettingsDebounced();
    updateStatus();
}

// 渲染排除规则
function renderExclusionRules() {
    const settings = extension_settings[extensionName];
    const container = $('#exclusion_rules_container');
    container.empty();
    
    settings.exclusion.rules.forEach((rule, index) => {
        const ruleItem = $(`
            <div class="exclusion-rule-item">
                <input type="text" placeholder="起始标记" value="${rule.start}" data-index="${index}" data-field="start">
                <input type="text" placeholder="结束标记" value="${rule.end}" data-index="${index}" data-field="end">
                <button data-index="${index}">删除</button>
            </div>
        `);
        
        ruleItem.find('input').on('input', function() {
            const idx = $(this).data('index');
            const field = $(this).data('field');
            settings.exclusion.rules[idx][field] = $(this).val();
            saveSettings();
        });
        
        ruleItem.find('button').on('click', function() {
            const idx = $(this).data('index');
            settings.exclusion.rules.splice(idx, 1);
            saveSettings();
            renderExclusionRules();
        });
        
        container.append(ruleItem);
    });
}

// 添加排除规则
function addExclusionRule() {
    const settings = extension_settings[extensionName];
    settings.exclusion.rules.push({ start: '', end: '' });
    saveSettings();
    renderExclusionRules();
}

// 测试API连接
async function testAPIConnection() {
    const settings = extension_settings[extensionName];
    const statusDiv = $('#api_test_status');
    
    statusDiv.show().html('🔄 正在测试连接...').css('color', '#4a90e2');
    
    try {
        let apiUrl = settings.api.url.trim();
        if (!apiUrl) {
            statusDiv.html('⚠️ 请先填写API地址').css('color', '#e74c3c');
            return;
        }
        
        // 确保URL格式正确
        if (!apiUrl.endsWith('/v1/models')) {
            if (apiUrl.endsWith('/')) {
                apiUrl = apiUrl.slice(0, -1);
            }
            if (apiUrl.endsWith('/v1')) {
                apiUrl += '/models';
            } else {
                apiUrl += '/v1/models';
            }
        }
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.api.key || ''}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        statusDiv.html('✓ 连接成功！').css('color', '#27ae60');
        toastr.success('API连接测试成功', '自动总结');
        
        setTimeout(() => {
            statusDiv.fadeOut();
        }, 3000);
    } catch (error) {
        console.error('[自动总结] 测试连接失败:', error);
        statusDiv.html(`✗ 连接失败: ${error.message}`).css('color', '#e74c3c');
        toastr.error(`连接失败: ${error.message}`, '自动总结');
    }
}

// 拉取模型列表
async function fetchModels() {
    const settings = extension_settings[extensionName];
    const statusDiv = $('#api_test_status');
    
    statusDiv.show().html('🔄 正在获取模型列表...').css('color', '#4a90e2');
    
    try {
        let apiUrl = settings.api.url.trim();
        if (!apiUrl) {
            statusDiv.html('⚠️ 请先填写API地址').css('color', '#e74c3c');
            toastr.warning('请先填写API地址', '自动总结');
            return;
        }
        
        // 确保URL格式正确
        if (!apiUrl.endsWith('/v1/models')) {
            if (apiUrl.endsWith('/')) {
                apiUrl = apiUrl.slice(0, -1);
            }
            if (apiUrl.endsWith('/v1')) {
                apiUrl += '/models';
            } else {
                apiUrl += '/v1/models';
            }
        }
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${settings.api.key || ''}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            statusDiv.html('⚠️ 未找到可用模型').css('color', '#e74c3c');
            toastr.warning('未找到可用模型', '自动总结');
            return;
        }
        
        // 显示模型选择对话框
        const modelNames = data.data.map(m => m.id || m.name || m).filter(Boolean);
        
        const modalHtml = `
            <div class="auto-summary-modal">
                <div class="auto-summary-modal-content">
                    <div class="auto-summary-modal-header">
                        <h2>📋 选择模型</h2>
                    </div>
                    <div class="auto-summary-modal-body">
                        <p>找到 ${modelNames.length} 个可用模型：</p>
                        <select id="model_select" size="10" style="width: 100%; padding: 5px;">
                            ${modelNames.map(name => `<option value="${name}">${name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="auto-summary-modal-footer">
                        <button class="auto-summary-btn success" id="select_model_btn">✓ 选择</button>
                        <button class="auto-summary-btn danger" id="cancel_model_btn">✗ 取消</button>
                    </div>
                </div>
            </div>
        `;
        
        const modal = $(modalHtml);
        $('body').append(modal);
        
        modal.find('#select_model_btn').on('click', function() {
            const selectedModel = modal.find('#model_select').val();
            if (selectedModel) {
                $('#api_model').val(selectedModel);
                settings.api.model = selectedModel;
                saveSettings();
                toastr.success(`已选择模型: ${selectedModel}`, '自动总结');
            }
            modal.remove();
        });
        
        modal.find('#cancel_model_btn').on('click', function() {
            modal.remove();
        });
        
        modal.on('click', function(e) {
            if (e.target === modal[0]) {
                modal.remove();
            }
        });
        
        statusDiv.html(`✓ 找到 ${modelNames.length} 个模型`).css('color', '#27ae60');
        setTimeout(() => {
            statusDiv.fadeOut();
        }, 3000);
        
    } catch (error) {
        console.error('[自动总结] 获取模型列表失败:', error);
        statusDiv.html(`✗ 获取失败: ${error.message}`).css('color', '#e74c3c');
        toastr.error(`获取模型列表失败: ${error.message}`, '自动总结');
    }
}

// 设置UI事件监听
function setupUIHandlers() {
    // 基础设置事件（移除自动保存，改为手动保存）
    $('#auto_summary_enabled, #small_summary_auto_enabled, #small_summary_interactive, #tag_extraction_enabled, #exclusion_enabled, #vectorization_enabled').on('change', function() {
        // 不自动保存，等待用户点击保存按钮
    });
    
    $('#auto_summary_target, #auto_summary_retention_count, #small_summary_threshold, #small_summary_prompt, #large_summary_prompt, #extraction_tags, #lore_activation_mode, #lore_keywords, #lore_insertion_position, #lore_depth, #api_url, #api_key, #api_model').on('input', function() {
        // 不自动保存，等待用户点击保存按钮
    });
    
    // 保存设置按钮
    $('#save_settings_btn').on('click', function() {
        saveSettings();
        toastr.success('设置已保存', '自动总结');
    });
    
    // 测试连接按钮
    $('#test_api_connection_btn').on('click', testAPIConnection);
    
    // 拉取模型按钮
    $('#fetch_models_btn').on('click', fetchModels);
    
    // 添加排除规则按钮
    $('#add_exclusion_rule_btn').on('click', addExclusionRule);
    
// 手动执行小总结
    $('#manual_small_summary_btn').on('click', async function() {
        const settings = extension_settings[extensionName];
        const context = getContext();
        
        console.log('[自动总结-调试] === 开始手动小总结 ===');
        console.log('[自动总结-调试] 当前对话长度:', context.chat?.length || 0);
        console.log('[自动总结-调试] 保留消息数:', settings.retentionCount);
        
        try {
            const lorebookName = await getTargetLorebookName();
            console.log('[自动总结-调试] 目标世界书:', lorebookName);
            
            const summarizedCount = await readSummaryProgress(lorebookName);
            console.log('[自动总结-调试] 已总结楼层数:', summarizedCount);
            
            const retentionCount = settings.retentionCount || 5;
            const totalMessages = context.chat.length;
            const summarizableLength = totalMessages - retentionCount;
            const unsummarizedCount = summarizableLength - summarizedCount;
            
            console.log('[自动总结-调试] 总消息数:', totalMessages);
            console.log('[自动总结-调试] 保留消息数:', retentionCount);
            console.log('[自动总结-调试] 可总结长度 (总数-保留):', summarizableLength);
            console.log('[自动总结-调试] 已总结数:', summarizedCount);
            console.log('[自动总结-调试] 未总结消息数 (可总结-已总结):', unsummarizedCount);
            
            if (unsummarizedCount <= 0) {
                console.log('[自动总结-调试] 没有需要总结的新消息');
                toastr.info('没有需要总结的新消息', '自动总结');
                return;
            }
            
            const startFloor = summarizedCount + 1;
            const endFloor = Math.min(summarizedCount + settings.smallSummary.threshold, summarizableLength);
            
            console.log('[自动总结-调试] 总结范围:', startFloor, '至', endFloor, '楼');
            
            await executeSmallSummary(startFloor, endFloor, false);
            console.log('[自动总结-调试] === 小总结完成 ===');
        } catch (error) {
            console.error('[自动总结-调试] 手动总结失败:', error);
            console.error('[自动总结-调试] 错误堆栈:', error.stack);
            toastr.error(`执行失败: ${error.message}`, '自动总结');
        }
    });
    
    // 手动执行大总结
    $('#manual_large_summary_btn').on('click', async function() {
        await executeLargeSummary();
    });
    
    // 重置总结进度
    $('#reset_progress_btn').on('click', async function() {
        if (!confirm('确定要重置总结进度吗？这将清空世界书中的总结条目内容，但保留条目本身。\n\n重置后会从第1楼重新开始总结。')) {
            return;
        }
        
        try {
            const lorebookName = await getTargetLorebookName();
            const bookData = await loadWorldInfo(lorebookName);
            
            if (!bookData || !bookData.entries) {
                toastr.error('未找到世界书', '自动总结');
                return;
            }
            
            const summaryEntry = Object.values(bookData.entries).find(
                e => e.comment === SUMMARY_COMMENT && !e.disable
            );
            
            if (!summaryEntry) {
                toastr.info('未找到总结条目，无需重置', '自动总结');
                return;
            }
            
            // 重置内容为初始状态
            summaryEntry.content = `以下是依照顺序已发生剧情\n\n本条勿动【前0楼总结已完成】否则后续总结无法进行。`;
            
            await saveWorldInfo(lorebookName, bookData, true);
            
            toastr.success('总结进度已重置，将从第1楼重新开始', '自动总结');
            updateStatus();
        } catch (error) {
            console.error('[自动总结] 重置进度失败:', error);
            toastr.error(`重置失败: ${error.message}`, '自动总结');
        }
    });
    
    // 删除总结条目
    $('#delete_summary_entry_btn').on('click', async function() {
        if (!confirm('⚠️ 警告：确定要完全删除总结条目吗？\n\n这将永久删除世界书中的总结条目及其所有内容，无法恢复！\n\n如果只是想重新开始，建议使用"重置进度"功能。')) {
            return;
        }
        
        try {
            const lorebookName = await getTargetLorebookName();
            const bookData = await loadWorldInfo(lorebookName);
            
            if (!bookData || !bookData.entries) {
                toastr.error('未找到世界书', '自动总结');
                return;
            }
            
            // 找到总结条目并获取其key
            let entryKeyToDelete = null;
            for (const [key, entry] of Object.entries(bookData.entries)) {
                if (entry.comment === SUMMARY_COMMENT && !entry.disable) {
                    entryKeyToDelete = key;
                    break;
                }
            }
            
            if (!entryKeyToDelete) {
                toastr.info('未找到总结条目，无需删除', '自动总结');
                return;
            }
            
            // 删除条目
            delete bookData.entries[entryKeyToDelete];
            
            await saveWorldInfo(lorebookName, bookData, true);
            
            toastr.success('总结条目已完全删除', '自动总结');
            updateStatus();
        } catch (error) {
            console.error('[自动总结] 删除条目失败:', error);
            toastr.error(`删除失败: ${error.message}`, '自动总结');
        }
    });
}

// 初始化扩展
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}settings.html`);
    
    // 创建扩展面板
    const extensionPanel = $(`
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>📖 自动总结世界书</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${settingsHtml}
            </div>
        </div>
    `);
    
    $('#extensions_settings2').append(extensionPanel);
    
    // 加载设置
    loadSettings();
    
    // 设置事件监听
    setupUIHandlers();
    
    // 监听聊天消息事件，自动触发总结
    eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        checkAndAutoSummary();
    });
    
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        updateStatus();
    });
    
    console.log('[自动总结世界书] 扩展已加载');
});
