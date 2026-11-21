import type { DemoWarehouseCode } from '../demo-catalog';

export const EXTRA_CATEGORIES = [
  { slug: 'mang-wifi', name: 'Mạng & Wi-Fi' },
  { slug: 'gaming', name: 'Gaming' },
  { slug: 'chup-anh-quay-phim', name: 'Chụp ảnh & Quay phim' },
  { slug: 'dien-gia-dung', name: 'Điện gia dụng' },
  { slug: 'bep-ban-an', name: 'Bếp & Bàn ăn' },
  { slug: 'nha-cua-trang-tri', name: 'Nhà cửa & Trang trí' },
  { slug: 'ban-hoc-van-phong', name: 'Bàn học & Văn phòng' },
  { slug: 'the-thao-da-ngoai', name: 'Thể thao & Dã ngoại' },
  { slug: 'du-lich-hanh-ly', name: 'Du lịch & Hành lý' },
  { slug: 'cham-soc-ca-nhan', name: 'Chăm sóc cá nhân' },
  { slug: 'me-va-be', name: 'Mẹ & Bé' },
  { slug: 'cham-soc-thu-cung', name: 'Chăm sóc thú cưng' },
  { slug: 'xe-va-phu-kien', name: 'Xe & Phụ kiện' },
  { slug: 'dung-cu-sua-chua', name: 'Dụng cụ & Sửa chữa' },
  { slug: 've-sinh-nha-cua', name: 'Vệ sinh nhà cửa' },
  { slug: 'thuc-pham-do-uong', name: 'Thực phẩm & Đồ uống' },
] as const;

type Entry = readonly [sku: string, name: string, priceThousands: number, description: string];

// Giá niêm yết mẫu theo nghìn đồng, độc lập với giá của nhà bán trên thị trường.
const productsByCategory = {
  'dien-thoai-may-tinh-bang': [
    ['MOB-NOVAPHONE-L128', 'Điện thoại NovaPhone Lite 128 GB', 3290, 'Màn hình 6,5 inch, bộ nhớ 128 GB và pin 5.000 mAh cho nhu cầu hằng ngày.'],
    ['MOB-ORBIT-X256', 'Điện thoại Orbit X 256 GB', 7990, 'Màn hình AMOLED 120 Hz, bộ nhớ 256 GB và camera chính 50 MP.'],
    ['TAB-NOVANOTE-M8', 'Máy tính bảng NovaNote Mini 8', 3690, 'Màn hình 8,7 inch, Wi-Fi và bộ nhớ 64 GB, vừa tay khi đọc.'],
    ['TAB-ORBIT-STUDY12', 'Máy tính bảng Orbit Study 12', 9990, 'Màn hình 12 inch, bộ nhớ 256 GB, hỗ trợ bút đi kèm để ghi chú.'],
  ],
  'laptop-may-tinh': [
    ['LAP-NOVABOOK-S13', 'Laptop NovaBook Study 13', 11490, 'Màn hình 13,3 inch, RAM 8 GB và SSD 256 GB cho ghi chú, trình duyệt và tài liệu.'],
    ['LAP-ORBIT-BIZ15', 'Laptop Orbit Business 15', 15990, 'Màn hình 15,6 inch, RAM 16 GB, SSD 512 GB và bàn phím số.'],
    ['PC-NOVADESK-MINI', 'Máy tính mini NovaDesk 16/512', 8990, 'Máy tính để bàn mini RAM 16 GB, SSD 512 GB, có HDMI và Ethernet.'],
    ['PC-ORBIT-CREATOR1', 'Máy tính Orbit Creator 1', 21990, 'Máy tính để bàn RAM 32 GB, SSD 1 TB và card đồ họa 8 GB. Sản phẩm gồm thân máy.'],
  ],
  'am-thanh': [
    ['AUD-AIRBEAM-FLEX', 'Tai nghe AirBeam Flex', 1490, 'Tai nghe chụp tai Bluetooth với đệm mềm, hỗ trợ cáp âm thanh 3,5 mm.'],
    ['AUD-WAVE-DUO', 'Loa để bàn Wave Duo 2.0', 990, 'Bộ hai loa để bàn, có núm chỉnh âm lượng và đầu vào 3,5 mm.'],
    ['AUD-TALK-USB1', 'Micrô USB ClearTalk 1', 890, 'Micrô để bàn hướng thu phía trước, đi kèm chân đế và cáp USB.'],
    ['AUD-AIRBEAM-LITE', 'Tai nghe có dây AirBeam Lite', 199, 'Tai nghe in-ear đầu 3,5 mm, kèm micrô và nút nhận cuộc gọi.'],
  ],
  'thiet-bi-deo-thong-minh': [
    ['WRB-PULSE-WATCH-G', 'Đồng hồ Pulse Watch Go', 1790, 'Mặt tròn 1,3 inch, dây silicone, nhận thông báo và theo dõi vận động.'],
    ['WRB-ORBIT-TRAIL', 'Đồng hồ Orbit Trail', 3490, 'Đồng hồ thể thao tích hợp GPS, có chế độ đi bộ, chạy và đạp xe.'],
    ['WRB-PULSE-BAND-N', 'Vòng đeo Pulse Band Neo', 890, 'Màn hình chữ nhật, dây thay được và theo dõi bước chân.'],
    ['WRB-PULSE-STRAP20', 'Dây đồng hồ Pulse silicone 20 mm', 159, 'Dây silicone khóa gài, dùng cho đồng hồ có chốt tháo nhanh 20 mm.'],
  ],
  'phu-kien-cong-nghe': [
    ['ACC-POWERPACK-10K', 'Pin dự phòng PowerPack 10.000 mAh', 449, 'Dung lượng 10.000 mAh, một cổng USB-C và một cổng USB-A.'],
    ['ACC-FLEXCABLE-C2M', 'Cáp FlexCable USB-C 2 m', 129, 'Cáp bọc sợi dài 2 m, hỗ trợ sạc USB Power Delivery tối đa 60 W.'],
    ['ACC-DOCKHUB-6', 'Hub DockHub USB-C 6 cổng', 749, 'Gồm HDMI, USB-A, đầu đọc thẻ và cổng cấp nguồn USB-C.'],
    ['ACC-NOVASLEEVE-14', 'Túi chống sốc NovaSleeve 14 inch', 249, 'Túi lót mềm, ngăn ngoài để cáp và bộ sạc. Kiểm tra kích thước máy trước khi chọn.'],
  ],
  'gia-dung-thong-minh': [
    ['SMH-HOMEVIEW-P3', 'Camera xoay HomeView P3', 1190, 'Camera Wi-Fi trong nhà hỗ trợ xoay, hình ảnh 2K và thẻ microSD.'],
    ['SMH-SMARTPLUG-10A', 'Ổ cắm hẹn giờ SmartPlug 10 A', 299, 'Ổ cắm Wi-Fi có hẹn giờ, dùng trong nhà và tải tối đa 10 A.'],
    ['SMH-LUMEN-A60', 'Bóng đèn thông minh Lumen A60', 259, 'Bóng LED 9 W chân E27, chỉnh độ sáng và màu ánh sáng qua Wi-Fi.'],
    ['SMH-CLEANBOT-M2', 'Robot hút bụi CleanBot M2', 4490, 'Robot có chế độ hút, lau và hẹn lịch, kèm đế sạc.'],
  ],
  'man-hinh-may-chieu': [
    ['DSP-NOVAVIEW-24FHD', 'Màn hình NovaView 24 FHD', 2490, 'Màn IPS 23,8 inch Full HD, 100 Hz và cổng HDMI.'],
    ['DSP-ORBIT-27QHD', 'Màn hình Orbit 27 QHD 165 Hz', 5990, 'Màn IPS 27 inch QHD, tần số quét tối đa 165 Hz qua DisplayPort.'],
    ['DSP-POCKETVIEW-156', 'Màn hình di động PocketView 15,6', 3490, 'Màn Full HD 15,6 inch, đầu vào USB-C DisplayPort và mini HDMI.'],
    ['DSP-SCREEN-F80', 'Màn chiếu gấp FoldScreen 80 inch', 649, 'Màn vải tỉ lệ 16:9, gấp gọn và có khoen treo.'],
  ],
  'thiet-bi-luu-tru': [
    ['STG-SWIFT-USB64', 'USB Swift Drive 64 GB', 149, 'USB-A 3.2 dung lượng 64 GB, nắp trượt bảo vệ đầu cắm.'],
    ['STG-ORBIT-SSD2TB', 'SSD di động Orbit Drive 2 TB', 3590, 'SSD 2 TB dùng USB-C 10 Gbps, kèm cáp USB-C.'],
    ['STG-MSD-PRO256', 'Thẻ microSD Pro 256 GB', 499, 'Thẻ microSDXC 256 GB chuẩn UHS-I, kèm bộ chuyển SD.'],
    ['STG-DOCK-NVME10', 'Hộp SSD DockDrive M.2 NVMe', 529, 'Hộp nhôm USB-C 10 Gbps cho SSD M.2 NVMe 2280. Sản phẩm chưa gồm SSD.'],
  ],
  'mang-wifi': [
    ['NET-LINKMESH-AX18', 'Bộ phát LinkMesh AX1800', 1190, 'Router Wi-Fi 6 hai băng tần, có bốn cổng Gigabit Ethernet.'],
    ['NET-LINKMESH-X30D', 'Bộ mesh LinkMesh AX3000 hai thiết bị', 2790, 'Bộ hai điểm phát Wi-Fi 6 dùng chung tên mạng cho nhà nhiều phòng.'],
    ['NET-LINKBOOST-AC12', 'Bộ mở rộng LinkBoost AC1200', 579, 'Bộ mở rộng tín hiệu Wi-Fi hai băng tần, cắm trực tiếp vào ổ điện.'],
    ['NET-SWITCH-G5', 'Switch LinkSwitch 5 cổng Gigabit', 399, 'Switch Gigabit Ethernet 5 cổng, lắp đặt không cần cấu hình.'],
    ['NET-ADAPTER-UAX', 'USB Wi-Fi LinkAir AX900', 429, 'Bộ thu Wi-Fi USB hai băng tần cho máy tính để bàn, cần cài trình điều khiển.'],
    ['NET-CAT6-10M', 'Cáp mạng LinkLine Cat6 10 m', 129, 'Cáp Ethernet Cat6 bấm sẵn hai đầu RJ45 dài 10 m.'],
    ['NET-LINKPOE-48', 'Bộ cấp nguồn LinkPoE 48 V', 349, 'Bộ cấp nguồn PoE chuẩn 802.3af cho thiết bị tương thích.'],
  ],
  'gaming': [
    ['GAM-KEYFORGE-K68', 'Bàn phím cơ KeyForge K68', 1190, 'Bàn phím 68 phím, switch linear, cáp USB-C tháo rời.'],
    ['GAM-AIMTRACK-M7', 'Chuột gaming AimTrack M7', 699, 'Chuột có dây với cảm biến chỉnh DPI và hai nút bên.'],
    ['GAM-ORBIT-PAD2', 'Tay cầm Orbit Pad 2', 899, 'Tay cầm Bluetooth và USB-C, hỗ trợ máy tính và thiết bị Android tương thích.'],
    ['GAM-SOUNDZONE-H5', 'Tai nghe SoundZone H5', 799, 'Tai nghe chụp tai 3,5 mm với micrô xoay và đệm vải.'],
    ['GAM-GLIDE-MATXL', 'Lót chuột GlideMat XL', 229, 'Tấm lót vải 80 × 30 cm, có đế cao su và viền may.'],
    ['GAM-DESK-ARM1', 'Tay đỡ màn hình Orbit Arm', 849, 'Tay đỡ một màn hình chuẩn VESA 75 × 75 hoặc 100 × 100 mm, tải tối đa 8 kg.'],
    ['GAM-PADBAY-D2', 'Đế sạc tay cầm PadBay D2', 369, 'Đế đặt bàn hai khe, dùng với tay cầm Orbit Pad 2.'],
  ],
  'chup-anh-quay-phim': [
    ['CAM-TRAVEL-T150', 'Chân máy TravelTripod T150', 689, 'Chân nhôm ba đoạn cao tối đa 150 cm, có đầu ren 1/4 inch.'],
    ['CAM-LUMEN-R26', 'Đèn vòng Lumen Ring 26', 399, 'Đèn vòng 26 cm cấp nguồn USB, kèm kẹp điện thoại và chỉnh độ sáng.'],
    ['CAM-CLEARCLIP-DUO', 'Micrô không dây ClearClip Duo', 1290, 'Bộ hai micrô cài áo với đầu thu USB-C cho thiết bị hỗ trợ âm thanh USB.'],
    ['CAM-GRIP-PHONE1', 'Kẹp điện thoại FrameGrip', 159, 'Kẹp lò xo cho điện thoại rộng 58–88 mm, có ren gắn chân máy.'],
    ['CAM-FRAMEBAG-6L', 'Túi máy ảnh FrameBag 6 L', 599, 'Túi đeo chéo 6 L có vách đệm di động cho thân máy và phụ kiện.'],
    ['CAM-CLEARLENS-KIT', 'Bộ vệ sinh ống kính ClearLens', 149, 'Gồm bóng thổi bụi, cọ mềm và khăn microfiber vệ sinh bề mặt ống kính.'],
    ['CAM-STREAM-C1080', 'Webcam FrameStream 1080p', 649, 'Webcam Full HD 30 fps, có micrô tích hợp và kẹp màn hình.'],
  ],
  'dien-gia-dung': [
    ['APP-CRISPAIR-45', 'Nồi chiên không dầu CrispAir 4,5 L', 1490, 'Giỏ chiên 4,5 L tháo rời, có hẹn giờ và chỉnh nhiệt.'],
    ['APP-RICEPLUS-18', 'Nồi cơm điện RicePlus 1,8 L', 899, 'Lòng nồi chống dính, nút nấu cơ và chế độ giữ ấm.'],
    ['APP-QUICKBOIL-17', 'Ấm siêu tốc QuickBoil 1,7 L', 359, 'Ruột inox, đế xoay 360 độ và tự ngắt khi nước sôi.'],
    ['APP-BLENDGO-600', 'Máy xay sinh tố BlendGo 600 ml', 629, 'Máy xay cối 600 ml, kèm nắp để dùng cối như bình mang theo.'],
    ['APP-PUREAIR-H13', 'Máy lọc không khí PureAir H13', 2190, 'Máy lọc có ba tốc độ quạt, bộ lọc bụi và đèn báo thay lọc.'],
    ['APP-COOLFAN-F30', 'Quạt bàn CoolFan 30 cm', 559, 'Quạt bàn ba tốc độ, có điều chỉnh góc và chế độ quay.'],
    ['APP-STEAM-G10', 'Bàn ủi hơi nước cầm tay SteamGo', 699, 'Bàn ủi hơi nước có bình rời, phù hợp làm phẳng quần áo treo.'],
  ],
  'bep-ban-an': [
    ['KTC-PANCERA-26', 'Chảo chống dính PanCera 26 cm', 429, 'Chảo nhôm phủ chống dính, đáy dùng được trên bếp từ.'],
    ['KTC-STOCKPOT-24', 'Nồi inox CookHouse 24 cm', 590, 'Nồi inox 24 cm với nắp kính, dùng đun súp và luộc.'],
    ['KTC-GLASSBOX-3', 'Bộ hộp thủy tinh GlassBox 3 món', 359, 'Ba hộp 370, 640 và 1.040 ml có nắp gài và gioăng rời.'],
    ['KTC-CUTBOARD-B38', 'Thớt tre Bamboo Board 38 cm', 169, 'Thớt tre có rãnh hứng nước, dùng sơ chế thực phẩm hằng ngày.'],
    ['KTC-THERMOCUP-500', 'Ly giữ nhiệt ThermoCup 500 ml', 249, 'Ly inox hai lớp với nắp trượt, vừa nhiều hộc để cốc.'],
    ['KTC-CERAMIC-B4', 'Bộ bát sứ Everyday 4 chiếc', 189, 'Bốn bát sứ 450 ml, men trơn để dùng trong bữa ăn.'],
    ['KTC-DIGISCALE-5K', 'Cân nhà bếp DigiScale 5 kg', 179, 'Cân điện tử cho nguyên liệu, có chức năng trừ bì.'],
  ],
  'nha-cua-trang-tri': [
    ['HOM-WARMLIGHT-D1', 'Đèn bàn WarmLight D1', 489, 'Đèn bàn ánh sáng ấm với chụp vải và công tắc trên dây.'],
    ['HOM-STORBOX-22', 'Hộp lưu trữ StorBox 22 L', 179, 'Hộp nhựa trong có nắp gài, dùng sắp xếp đồ trong tủ.'],
    ['HOM-WEAVE-BASKET', 'Giỏ vải Weave Basket 35 cm', 169, 'Giỏ vải có quai xách, gấp gọn khi không sử dụng.'],
    ['HOM-CUSHION-L45', 'Gối tựa Linen 45 × 45 cm', 219, 'Gối tựa có vỏ dệt pha linen với khóa kéo và lõi rời.'],
    ['HOM-FLOORMAT-6080', 'Thảm dệt CozyMat 60 × 80 cm', 259, 'Thảm dệt màu trung tính, có đế chống trượt cho sàn khô.'],
    ['HOM-FRAME-OAK-A4', 'Khung ảnh OakFrame A4', 159, 'Khung màu gỗ sồi cho ảnh A4, có móc treo và chân dựng.'],
    ['HOM-COAT-HOOK5', 'Thanh treo áo WallHook 5 móc', 249, 'Thanh treo gắn tường 5 móc, phù hợp lối vào và phòng ngủ.'],
  ],
  'ban-hoc-van-phong': [
    ['OFF-NOTE-A5D', 'Sổ DotNote A5 160 trang', 89, 'Sổ giấy chấm lưới A5, đóng gáy để mở phẳng khi viết.'],
    ['OFF-PEN-GEL6', 'Bộ bút gel ClearWrite 6 cây', 79, 'Sáu bút gel ngòi 0,5 mm, gồm mực xanh và đen.'],
    ['OFF-DESKMAT-7035', 'Tấm lót bàn DeskMat 70 × 35 cm', 199, 'Tấm lót lau được, tạo bề mặt phẳng cho bàn phím và chuột.'],
    ['OFF-STAND-NOVA', 'Giá đỡ laptop NovaStand', 379, 'Giá đỡ nhôm gập được, có đệm silicone chống trượt.'],
    ['OFF-LABEL-BT1', 'Máy in nhãn MiniLabel BT', 679, 'Máy in nhiệt nhãn nhỏ kết nối Bluetooth, kèm cuộn nhãn khởi đầu.'],
    ['OFF-FILEBOX-A4', 'Hộp hồ sơ FileBox A4', 119, 'Hộp hồ sơ có gáy ghi nhãn để phân loại tài liệu và giấy A4.'],
    ['OFF-LUMEN-STUDY', 'Đèn học Lumen Study', 449, 'Đèn LED có tay gập, ba mức màu ánh sáng và chỉnh độ sáng.'],
  ],
  'the-thao-da-ngoai': [
    ['SPT-YOGAFLOW-T6', 'Thảm yoga FlowGrip 6 mm', 329, 'Thảm TPE dày 6 mm với hai mặt vân, kèm dây mang.'],
    ['SPT-FLEXBAND-3', 'Dây kháng lực FlexBand 3 mức', 139, 'Bộ ba dây vòng ngắn với ba mức lực cho các bài tập tại nhà.'],
    ['SPT-TRAILBOTTLE-750', 'Bình nước TrailBottle 750 ml', 179, 'Bình nhựa Tritan có quai và nắp bật để mang khi tập.'],
    ['SPT-CAMP-LANTERN', 'Đèn cắm trại CampGlow', 389, 'Đèn treo sạc USB-C với ba mức sáng và móc gấp.'],
    ['SPT-TRAILPACK-18', 'Ba lô dã ngoại TrailPack 18 L', 549, 'Ba lô nhẹ 18 L với hai ngăn bên, dây ngực và lưng lưới.'],
    ['SPT-PICNIC-MAT', 'Thảm picnic FoldMat 150 × 180 cm', 269, 'Thảm gấp có lớp đáy chống ẩm và quai xách.'],
    ['SPT-BADMINTON-S2', 'Bộ cầu lông Rally Start', 459, 'Bộ hai vợt, ba quả cầu và túi dây kéo cho chơi giải trí.'],
  ],
  'du-lich-hanh-ly': [
    ['TRV-ORBIT-20', 'Vali Orbit Cabin 20 inch', 1190, 'Vali vỏ nhựa cứng có bốn bánh đôi, tay kéo và khóa số. Kiểm tra giới hạn của hãng bay.'],
    ['TRV-ORBIT-24', 'Vali Orbit Travel 24 inch', 1490, 'Vali 24 inch với ngăn chia có khóa kéo và dây giữ quần áo.'],
    ['TRV-PACKCUBE-5', 'Bộ túi chia đồ PackCube 5 món', 249, 'Năm túi chia đồ nhiều cỡ cho quần áo, giày và đồ giặt.'],
    ['TRV-NECK-CLOUD', 'Gối cổ CloudRest', 229, 'Gối cổ foam với vỏ tháo giặt và nút gài phía trước.'],
    ['TRV-CABLE-CASE', 'Túi phụ kiện CableCase', 179, 'Túi đựng cáp và bộ sạc với ngăn lưới và đai co giãn.'],
    ['TRV-SCALE-50K', 'Cân hành lý TravelScale 50 kg', 159, 'Cân móc cầm tay có đai treo, tải tối đa 50 kg.'],
    ['TRV-BOTTLE-4', 'Bộ chai chiết du lịch 4 món', 99, 'Bộ chai chiết 60 ml với nhãn dán và túi trong để sắp xếp.'],
  ],
  'cham-soc-ca-nhan': [
    ['PC-SOFTSMILE-E1', 'Bàn chải điện SoftSmile E1', 549, 'Bàn chải sạc USB với hai chế độ rung và bộ hẹn giờ hai phút.'],
    ['PC-SOFTSMILE-B2', 'Đầu bàn chải SoftSmile bộ 2', 159, 'Bộ hai đầu lông mềm, tương thích tay cầm SoftSmile E1.'],
    ['PC-AIRDRY-1600', 'Máy sấy tóc AirDry 1600 W', 459, 'Máy sấy hai mức gió, có nút gió mát và đầu gom gió.'],
    ['PC-TRIMLINE-T3', 'Tông đơ cắt tóc TrimLine T3', 579, 'Tông đơ sạc USB, kèm lược định cữ và chổi vệ sinh.'],
    ['PC-SOFTTOWEL-70140', 'Khăn tắm cotton SoftTowel 70 × 140 cm', 189, 'Khăn cotton dệt vòng, cỡ dùng tắm hằng ngày.'],
    ['PC-MIRROR-L10', 'Gương bàn gập GlowMirror', 199, 'Gương bàn có chân gập, góc nghiêng điều chỉnh được.'],
    ['PC-ORGANIZER-S', 'Túi mỹ phẩm ZipCare S', 139, 'Túi có lớp lót lau được và ngăn trong cho đồ vệ sinh cá nhân.'],
  ],
  'me-va-be': [
    ['BAB-SOFTBIB-2', 'Yếm ăn silicone SoftBib bộ 2', 159, 'Hai yếm có máng hứng và khóa điều chỉnh vòng cổ.'],
    ['BAB-COTTON-T4', 'Bộ khăn sữa CottonCloud 4 chiếc', 119, 'Khăn vải cotton nhiều lớp, cỡ 30 × 30 cm.'],
    ['BAB-STACK8', 'Bộ cốc xếp chồng ColorStack 8', 169, 'Tám cốc xếp lồng nhiều màu cho trẻ từ 18 tháng theo nhãn.'],
    ['BAB-STORY-ANIMALS', 'Sách vải Chạm vào thế giới động vật', 139, 'Sách vải mềm có hình động vật và bề mặt tạo cảm giác khác nhau.'],
    ['BAB-SNACKBOX-3', 'Hộp đồ ăn SnackBox 3 ngăn', 189, 'Hộp có ba ngăn chia riêng và nắp gài để mang theo.'],
    ['BAB-CHANGEMAT-F', 'Tấm lót thay tã gấp gọn', 229, 'Tấm lót có lớp bề mặt lau được và túi nhỏ đựng phụ kiện.'],
    ['BAB-KIDBAG-6L', 'Ba lô trẻ em LittleTrail 6 L', 279, 'Ba lô 6 L có quai điều chỉnh và chỗ để thẻ tên.'],
  ],
  'cham-soc-thu-cung': [
    ['PET-BOWL-S450', 'Bát inox PetBowl 450 ml', 99, 'Bát inox có đế chống trượt, dùng đựng nước hoặc thức ăn.'],
    ['PET-LEASH-15', 'Dây dắt PetWalk 1,5 m', 129, 'Dây dệt dài 1,5 m với tay cầm đệm và móc kim loại.'],
    ['PET-BRUSH-S', 'Lược chải lông SoftPaw S', 149, 'Lược đầu bo tròn cho vật nuôi nhỏ, có nút gạt lông.'],
    ['PET-LITTERMAT-6045', 'Thảm hứng cát PawMat 60 × 45 cm', 189, 'Thảm hai lớp đón cát rơi khi vật nuôi ra khỏi khay.'],
    ['PET-CATTOY-3', 'Bộ đồ chơi mèo PlayPaw 3 món', 119, 'Gồm bóng mềm, chuột vải và cần trêu mèo.'],
    ['PET-CARRIER-M', 'Túi vận chuyển PetCarry M', 419, 'Túi vải có cửa lưới và tấm lót rời. Đo kích thước thú cưng trước khi chọn.'],
    ['PET-BED-ROUND50', 'Nệm tròn CozyPaw 50 cm', 329, 'Nệm tròn 50 cm cho thú cưng nhỏ với đế có vân.'],
  ],
  'xe-va-phu-kien': [
    ['CAR-HOLD-C1', 'Giá đỡ điện thoại DriveHold C1', 199, 'Giá kẹp cửa gió có khớp xoay và đệm giữ điện thoại.'],
    ['CAR-GANCHARGE-45', 'Sạc ô tô DriveCharge 45 W', 289, 'Bộ sạc cắm ổ điện ô tô 12–24 V, đầu ra USB-C và USB-A.'],
    ['CAR-CAM-FHD', 'Camera hành trình RoadView FHD', 1290, 'Camera Full HD ghi vòng lặp, kèm chân gắn và cáp nguồn.'],
    ['CAR-PUMP-A12', 'Bơm lốp điện AirRoad 12 V', 649, 'Bơm cắm ổ 12 V có đồng hồ số và chế độ ngắt theo áp suất đặt.'],
    ['CAR-FOLD-BOX', 'Hộp cốp xe RoadBox 35 L', 269, 'Hộp vải chia hai ngăn có đáy cứng và gấp gọn khi trống.'],
    ['CAR-SHADE-F145', 'Tấm che nắng kính trước 145 cm', 189, 'Tấm phản quang gập được, kích thước 145 × 70 cm.'],
    ['CAR-CLEAN-M6', 'Bộ khăn lau xe DriveClean 6 chiếc', 129, 'Khăn microfiber 30 × 30 cm để lau kính và bề mặt nội thất.'],
  ],
  'dung-cu-sua-chua': [
    ['TLS-SCREW32', 'Bộ tuốc nơ vít Precision 32 đầu', 239, 'Bộ đầu vít chính xác kèm tay cầm, nhíp và hộp phân ngăn.'],
    ['TLS-TAPE-5M', 'Thước cuộn MeasurePro 5 m', 99, 'Thước cuộn 5 m có khóa và móc cài đai.'],
    ['TLS-HEX-9', 'Bộ lục giác Metric 9 cây', 139, 'Chín lục giác hệ mét, đặt trong khay giữ theo cỡ.'],
    ['TLS-DRILL-12V', 'Máy khoan vặn vít Compact 12 V', 1090, 'Máy vặn vít hai tốc độ, kèm pin, bộ sạc và một số đầu cơ bản.'],
    ['TLS-BIT-SET24', 'Hộp đầu vít WorkBit 24 món', 229, 'Hộp đầu vít phổ biến với đầu chuyển từ tính 1/4 inch.'],
    ['TLS-PLIERS-3', 'Bộ kìm HandyGrip 3 chiếc', 329, 'Bộ kìm đa năng, kìm mũi dài và kìm cắt dùng sửa chữa gia dụng.'],
    ['TLS-PARTBOX-18', 'Hộp vít và phụ kiện PartBox 18 ngăn', 169, 'Hộp nhựa nắp trong với vách chia tháo lắp để sắp ốc và linh kiện.'],
  ],
  've-sinh-nha-cua': [
    ['CLN-SPINMOP-S6', 'Bộ cây lau SpinMop 6 L', 499, 'Cây lau xoay với xô 6 L, kèm hai bông lau microfiber.'],
    ['CLN-CLOTH-5', 'Khăn lau microfiber HomeClean bộ 5', 89, 'Năm khăn lau màu khác nhau để phân biệt khu vực làm sạch.'],
    ['CLN-DUST-EXT', 'Chổi phủi bụi ExtendDust', 169, 'Chổi đầu sợi mềm với cán rút để vệ sinh kệ và góc cao.'],
    ['CLN-SQUEEGEE-25', 'Gạt kính ClearSweep 25 cm', 79, 'Lưỡi gạt mềm rộng 25 cm với tay cầm có móc treo.'],
    ['CLN-BRUSH-KIT', 'Bộ cọ vệ sinh SlimBrush 3 món', 109, 'Ba cọ đầu nhỏ dùng cho đường ron, khe và góc khuất.'],
    ['CLN-LINT-ROLL2', 'Cây lăn bụi vải LintRoll và lõi thay', 99, 'Tay lăn dính dùng cho vải, kèm hai lõi xé từng lớp.'],
    ['CLN-VAC-H12', 'Máy hút bụi cầm tay CleanGo H12', 899, 'Máy hút bụi sạc USB-C, kèm đầu hút khe và đầu chổi nhỏ.'],
  ],
  'thuc-pham-do-uong': [
    ['FNB-CAFE-ROB250', 'Cà phê rang xay Robusta 250 g', 119, 'Cà phê rang vừa xay cho phin, đóng túi 250 g.'],
    ['FNB-TEA-JASMINE20', 'Trà xanh hoa nhài 20 túi', 79, 'Trà túi lọc hương nhài, hộp 20 gói pha riêng từng tách.'],
    ['FNB-OATS-ROLLED500', 'Yến mạch cán dẹt 500 g', 69, 'Yến mạch cán dẹt dùng nấu cháo, trộn sữa chua hoặc làm bánh.'],
    ['FNB-GRANOLA-NUT350', 'Granola hạt rang 350 g', 129, 'Yến mạch nướng với các loại hạt, đóng túi có khóa kéo.'],
    ['FNB-CASHEW-R250', 'Hạt điều rang nguyên vị 250 g', 139, 'Hạt điều rang nguyên vị trong túi 250 g.'],
    ['FNB-COCOA-200', 'Bột cacao nguyên chất 200 g', 119, 'Bột cacao không pha sẵn đường, dùng pha đồ uống hoặc làm bánh.'],
    ['FNB-HONEY-300', 'Mật ong hoa tự nhiên 300 g', 149, 'Mật ong đóng chai 300 g, dùng pha đồ uống và nấu ăn.'],
  ],
} satisfies Record<string, readonly Entry[]>;

const warehouses: DemoWarehouseCode[] = ['WH-HN01', 'WH-DN01', 'WH-HCM01'];

export const EXTRA_PRODUCTS = Object.entries(productsByCategory)
  .flatMap(([category, entries]) => entries.map((entry) => ({ category, entry })))
  .map(({ category, entry: [sku, name, priceThousands, description] }, index) => {
    const slug = sku.toLowerCase();
    const round = Math.floor(index / warehouses.length);
    const stock: Partial<Record<DemoWarehouseCode, number>> = {
      [warehouses[index % warehouses.length]]: 3 + round % 2,
    };
    if (round % 3 === 0) stock[warehouses[(index + 1) % warehouses.length]] = 2;
    return {
      sku,
      slug,
      imageUrl: `/products/catalog/${slug}.webp`,
      category,
      name,
      description,
      basePrice: priceThousands * 1_000,
      costPrice: Math.round(priceThousands * (0.68 + (index % 5) * 0.025)) * 1_000,
      stock,
    };
  });
