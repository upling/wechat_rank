let Consts = {
    OpenDataKeys: {
        ScoreKey: "maxSocre", // 存储在微信云端的分数数据字段
    },
    DomainAction: { //对应主域的消息字段
        //上传新分数
        updateScore: "updateScore",
        //打开好友排行榜
        FriendRank: "FriendRank",
        //翻页
        Paging: "Paging",
    },
}

const PAGE_SIZE = 6; //每页的条数
const ITEM_HEIGHT = 104;//item高度
const ITEM_WIDTH = 600;//item宽度

/**
 * 从高到低排序函数
 * @param {存储在微信云端的数据} gameDatas 
 * @param {依照本字段进行排序} field 
 */
const dataSorter = (gameDatas, field = Consts.OpenDataKeys.ScoreKey) => {
    return gameDatas.sort((a, b) => {
        const kvDataA = a.KVDataList.find(kvData => kvData.key === field);
        const kvDataB = b.KVDataList.find(kvData => kvData.key === field);
        const gradeA = kvDataA ? parseInt(JSON.parse(kvDataA.value).wxgame.score || 0) : 0;
        const gradeB = kvDataB ? parseInt(JSON.parse(kvDataB.value).wxgame.score || 0) : 0;
        return gradeA > gradeB ? -1 : gradeA < gradeB ? 1 : 0;
    });
}

class RankListRenderer {
    constructor() {
        this._mTotalPage = 0; //总页数
        this._mCurrPage = 0;  //当前页
        this._mGameDatas = []; //好友排行数据
        this._mMyRank = 0; //自己的排名位置
        this._mOpenid = null; //自己的openid
        this._init();
    }

    _init() {
        this.canvas = wx.getSharedCanvas();
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = "high";
    }

    //监听主域发来的消息
    _listen() {
        //msg -> {action, data}
        wx.onMessage(msg => {
            console.log("ranklist wx.onMessage", msg);
            switch (msg.action) {
                case Consts.DomainAction.FriendRank:
                    this._fetchFriendData();
                    if (msg.openid) {
                        this._mOpenid = msg.openid;
                    }
                    break;

                case Consts.DomainAction.updateScore:
                    this._updateScore(parseInt(msg.score));
                    break;

                case Consts.DomainAction.Paging:
                    if (!this._mGameDatas.length) {
                        return;
                    }
                    const delta = msg.page;
                    const newPage = this._mCurrPage + delta;
                    if (newPage < 0) {
                        console.log("已经是第一页了");
                        return;
                    }
                    if (newPage + 1 > this._mTotalPage) {
                        console.log("没有更多了");
                        return;
                    }
                    this._mCurrPage = newPage;
                    this._showPagedRanks(newPage);
                    console.log("当前页", this._mCurrPage);
                    break;
                default:
                    console.log(`未知消息类型:msg.action=${msg.action}`);
                    break;
            }
        });
    }

    //绘制我的排名
    _myRank() {

        this.ctx.fillStyle = "#3470B7";
        this.ctx.textAlign = "center";
        this.ctx.baseLine = "center";
        this.ctx.font = "30px Helvetica";

        if (this._mMyRank) {
            this.ctx.fillText("" + this._mMyRank, 360, 860);
        } else {
            this.ctx.fillText("未上榜", 360, 860);
        }
    }

    //查找自己的排名
    _findMyrank() {
        if (this._mOpenid) {
            for (let index = 0; index < this._mGameDatas.length; index++) {
                if (this._mGameDatas[index].openid == this._mOpenid) {
                    this._mMyRank = index + 1;
                    break;
                }
            }
        }
        this._myRank();//绘制自己排名
    }

    //上传分数，如果分数比云端高则更新云端分数
    _updateScore(score) {
        wx.getUserCloudStorage({
            keyList: [Consts.OpenDataKeys.ScoreKey],
            success: res => {
                let dList = res.KVDataList;
                console.log("getUserCloudStorage success", res);
                let cloudScore = 0;
                if (dList) {
                    for (let i = 0; i < dList.length; ++i) {
                        if (dList[i].key == Consts.OpenDataKeys.ScoreKey) {
                            cloudScore = parseInt(dList[i].value);
                            break;
                        }
                    }
                }
                if (score > cloudScore) {
                    let kvDataList = new Array();
                    let val = { wxgame: { score: score, update_time: new Date().getTime()}};
                    kvDataList.push({ key: Consts.OpenDataKeys.ScoreKey, value: JSON.stringify(val) });
                    wx.setUserCloudStorage({ KVDataList: kvDataList });
                }
            }
        });
    }

    // _fetchGroupData(shareTicket) {
    //     if (this._mGameDatas.length <= 0) {
    //         //取出群同玩成员数据
    //         wx.getGroupCloudStorage({
    //             shareTicket,
    //             keyList: [
    //                 Consts.OpenDataKeys.ScoreKey,
    //             ],
    //             success: res => {
    //                 console.log("wx.getGroupCloudStorage success", res);
    //                 const dataLen = res.data.length;
    //                 this._mGameDatas = dataSorter(res.data);
    //                 this._mCurrPage = 0;
    //                 this._mTotalPage = Math.ceil(dataLen / PAGE_SIZE);
    //                 if (dataLen) {
    //                     this._showPagedRanks(0);
    //                 }
    //             },
    //             fail: res => {
    //                 console.log("wx.getGroupCloudStorage fail", res);
    //             },
    //         });
    //     }
    // }

    _fetchFriendData() {
        //取出所有好友数据
        wx.getFriendCloudStorage({
            keyList: [
                Consts.OpenDataKeys.ScoreKey,
            ],
            success: res => {

                console.log("wx.getFriendCloudStorage success", res);
                const dataLen = res.data.length;
                this._mGameDatas = dataSorter(res.data);
                this._mCurrPage = 0;
                this._mTotalPage = Math.ceil(dataLen / PAGE_SIZE);

                if (dataLen) {
                    this._showPagedRanks(0);//显示排行榜数据
                    this._findMyrank();//查找自己排名
                }
            },
            fail: res => {
                console.log("wx.getFriendCloudStorage fail", res);
            },
        });
    }

    _showPagedRanks(page) {

        const pageStart = page * PAGE_SIZE;
        const pagedData = this._mGameDatas.slice(pageStart, pageStart + PAGE_SIZE);//获取当前页的数据
        const pageLen = pagedData.length;

        this.ctx.clearRect(0, ITEM_HEIGHT - 20, 620, 645); //清空渲染区域，准备渲染数据

        for (let i = 0, len = pageLen; i < pageLen; i++) {
            this._drawRankItem(this.ctx, i, pageStart + i + 1, pagedData[i], pageLen);
        }
    }

    //canvas原点在左上角
    _drawRankItem(ctx, index, rank, data, pageLen) {

        const avatarUrl = data.avatarUrl;
        //玩家名字超过6个字符则将多余的字符替换为...
        const nick = data.nickname.length <= 6 ? data.nickname : data.nickname.substr(0, 6) + "...";
        const kvData = data.KVDataList.find(kvData => kvData.key === Consts.OpenDataKeys.ScoreKey);
        const score = kvData ? JSON.parse(kvData.value).wxgame.score : 0;
        const itemGapY = ITEM_HEIGHT * (index + 1);

        //绘制单项背景
        let img = wx.createImage();
        let promise = this._setPromise(img, "openData/image/item.png");
        Promise.all([promise]).then(() => {
            this.ctx.drawImage(img, 0, itemGapY - 15, ITEM_WIDTH, ITEM_HEIGHT);

            //名次
            if (rank < 4) {
                const rankImg = wx.createImage();
                rankImg.src = `openData/image/icon${rank}.png`;
                rankImg.onload = () => {
                    ctx.drawImage(rankImg, 50, 15 + itemGapY, 40, 50);
                };
            } else {
                ctx.fillStyle = "#A53838";
                ctx.textAlign = "right";
                ctx.baseLine = "center";
                ctx.font = "35px Helvetica";
                ctx.fillText(`${rank}`, 65 + (10 * index / 10), 55 + itemGapY);
            }

            //头像
            const avatarX = 100;
            const avatarY = 10 + itemGapY;
            const avatarW = 48;
            const avatarH = 48;
            this._drawAvatar(ctx, avatarUrl, avatarX, avatarY, avatarW, avatarH);

            //名字
            ctx.fillStyle = "#A53838";
            ctx.textAlign = "center";
            ctx.baseLine = "center";
            ctx.font = "30px Helvetica";
            ctx.fillText(nick, 265, 40 + itemGapY);

            //分数
            ctx.fillStyle = "#A53838";
            ctx.textAlign = "center";
            ctx.baseLine = "center";
            ctx.font = "30px Arial";
            let scoreText = `${score}`;
            ctx.fillText(scoreText, 450, 40 + itemGapY);

            // //分隔线
            // const lineImg = wx.createImage();
            // lineImg.src = 'subdomain/images/llk_x.png';
            // lineImg.onload = () => {
            //     if(index + 1 > pageLen)
            //     {
            //         return;
            //     }
            //     ctx.drawImage(lineImg, 14, 120 + itemGapY, 720, 1);
            // };
        });
    }
    _setPromise(img, src) {
        return new Promise((resolve, reject) => {
            img.src = src;
            if (!src) {
                resolve()
            }
            img.onload = () => {
                resolve();
            }
        }).then(() => {
            console.log('背景图加载完毕');
        }).catch((err) => {
            console.log('背景图加载失败：', err);
        });

    }

    //绘制头像
    _drawAvatar(ctx, avatarUrl, x, y, w, h) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);

        const avatarImg = wx.createImage();
        avatarImg.src = avatarUrl;
        avatarImg.onload = () => {
            ctx.drawImage(avatarImg, x, y, w, h);
        };
    }
}

const rankList = new RankListRenderer();
rankList._listen();