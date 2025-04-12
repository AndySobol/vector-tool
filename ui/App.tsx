import * as React from "react";
import * as ReactDOM from "react-dom/client";
import iconApp from "../iconApp.png"; // импорт иконки
import cleanGif from "../screenshots/clean.gif";
import optimizeGif from "../screenshots/optimize.gif";
import filledGif from "../screenshots/filled.gif";

function App() {
  // Состояния для разных секций
  const [scopeClean, setScopeClean] = React.useState("selection");
  const [scopeOptimize, setScopeOptimize] = React.useState("selection");
  const [scopeFilled, setScopeFilled] = React.useState("selection");

  const [targetPoints, setTargetPoints] = React.useState("4");
  const [optimizeValue, setOptimizeValue] = React.useState("4");
  const [strokeWidth, setStrokeWidth] = React.useState("1");

  // Состояние для динамического изменения header при прокрутке
  const [headerShrink, setHeaderShrink] = React.useState(false);

  // Обработчик скролла: если прокручено больше 50px – уменьшаем header
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop >= 50) {
      setHeaderShrink(true);
    } else {
      setHeaderShrink(false);
    }
  };

  React.useEffect(() => {
    onmessage = (event) => {
      if (event.data.pluginMessage) {
        const message = event.data.pluginMessage;
        if (message.type === "selectionUpdated") {
          setTargetPoints(String(message.count));
          setOptimizeValue(String(message.count));
        }
      }
    };
  }, []);

  const postMessage = (msg: Record<string, any>) => {
    parent.postMessage({ pluginMessage: msg }, "*");
  };

  const getButtonLabel = (command: "clean" | "optimize" | "filled", scope: string): string => {
    let cmdName = "";
    switch (command) {
      case "clean": cmdName = "Clean"; break;
      case "optimize": cmdName = "Optimize"; break;
      case "filled": cmdName = "Filled"; break;
    }
    switch (scope) {
      case "selection": return `${cmdName} to Selection`;
      case "page":      return `${cmdName} to Page`;
      case "document":  return `${cmdName} to Document`;
      default:          return cmdName;
    }
  };

  return (
    // Добавляем onScroll обработчик к корневому контейнеру
    <div
      onScroll={handleScroll}
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 480,
        minHeight: 680,
        maxWidth: 680,
        maxHeight: 1080,
        boxSizing: "border-box",
        overflow: "auto",
        fontFamily: "SF Pro, sans-serif"
      }}
    >
      {/* ---------------- HEADER ---------------- */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#fff",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          padding: "16px 12px",
          gap: "12px",
          width: "100%",
          boxSizing: "border-box",
          borderBottom: "1px solid #DDDDDD",
          // Переход для плавного уменьшения
          transition: "all 0.3s ease"
        }}
      >
        {/* Иконка слева – меняем размер в зависимости от состояния */}
        <div
          style={{
            width: headerShrink ? 24 : 64,
            height: headerShrink ? 24 : 64,
            background: `url(${iconApp}) center center / contain no-repeat`,
            transition: "all 0.3s ease"
          }}
        />
        {/* Текст справа */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontSize: headerShrink ? 14 : 20,
              fontWeight: 700,
              lineHeight: headerShrink ? "18px" : "28px",
              background: "linear-gradient(90deg, #BB5301 0%, #000000 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              transition: "all 0.3s ease"
            }}
          >
            Vector Optimizer
          </div>
          {/* Описание показываем только если header не уменьшен */}
          {!headerShrink && (
            <div
              style={{
                fontSize: 12,
                lineHeight: "16px",
                color: "#555555",
                transition: "all 0.3s ease"
              }}
            >
              Плагин для очистки, оптимизации и преобразования векторов.
            </div>
          )}
        </div>
      </div>

      {/* Отделитель */}
      <div
        style={{
          width: "100%",
          height: 1,
          backgroundColor: "#E8E8E8"
        }}
      />

      {/* -------------- CLEAN SECTION -------------- */}
      <div style={{ padding: "24px 16px", boxSizing: "border-box" }}>
        <div
          style={{
            width: "100%",
            height: 144,
            backgroundImage: `url(${cleanGif})`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            borderRadius: 12,
            marginBottom: 16
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 590, fontSize: 14, marginBottom: 4 }}>
              Clean Vector
            </div>
            <div style={{ fontSize: 11, color: "#555555" }}>
              Удаляет лишние точки, распаковывает группы и объединяет векторные узлы,
              сохраняя исходное заполнение.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select
              value={scopeClean}
              onChange={(e) => setScopeClean(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #EBEBEB"
              }}
            >
              <option value="selection">Apply to Selection</option>
              <option value="page">Apply to Page</option>
              <option value="document">Apply to Document</option>
            </select>
            <button
              style={{
                width: "100%",
                padding: 10,
                backgroundColor: "#FFA000",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 14,
                cursor: "pointer"
              }}
              onClick={() => postMessage({ scope: scopeClean, command: "clean" })}
            >
              {getButtonLabel("clean", scopeClean)}
            </button>
          </div>
        </div>
      </div>

      {/* Разделительная линия */}
      <div
        style={{
          width: "100%",
          height: 1,
          backgroundColor: "#E8E8E8"
        }}
      />

      {/* -------------- OPTIMIZE SECTION -------------- */}
      <div style={{ padding: "24px 16px", boxSizing: "border-box" }}>
        <div
          style={{
            width: "100%",
            height: 144,
            backgroundImage: `url(${optimizeGif})`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            borderRadius: 12,
            marginBottom: 16
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 590, fontSize: 14, marginBottom: 4 }}>
              Optimize Vector
            </div>
            <div style={{ fontSize: 11, color: "#555555" }}>
              Изменяет число опорных точек в векторе. Текущее число: {targetPoints}.
              Чтобы оптимизировать, задай желаемое количество точек.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select
              value={scopeOptimize}
              onChange={(e) => setScopeOptimize(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #EBEBEB"
              }}
            >
              <option value="selection">Apply to Selection</option>
              <option value="page">Apply to Page</option>
              <option value="document">Apply to Document</option>
            </select>
            <input
              type="number"
              min="2"
              step="1"
              value={optimizeValue}
              onChange={(e) => setOptimizeValue(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #EBEBEB"
              }}
            />
            <button
              style={{
                width: "100%",
                padding: 10,
                backgroundColor: "#FFA000",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 14,
                cursor: "pointer"
              }}
              onClick={() =>
                postMessage({
                  scope: scopeOptimize,
                  command: "optimize",
                  targetPoints: optimizeValue
                })
              }
            >
              {getButtonLabel("optimize", scopeOptimize)}
            </button>
          </div>
        </div>
      </div>

      {/* Разделительная линия */}
      <div
        style={{
          width: "100%",
          height: 1,
          backgroundColor: "#E8E8E8"
        }}
      />

      {/* -------------- FILLED TO STROKE SECTION -------------- */}
      <div style={{ padding: "24px 16px", boxSizing: "border-box" }}>
        <div
          style={{
            width: "100%",
            height: 144,
            backgroundImage: `url(${filledGif})`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            borderRadius: 12,
            marginBottom: 16
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 590, fontSize: 14, marginBottom: 4 }}>
              Filled to Stroke
            </div>
            <div style={{ fontSize: 11, color: "#555555" }}>
              Преобразует вектор с заливкой в вектор с обводкой. Укажи желаемую толщину обводки.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <select
              value={scopeFilled}
              onChange={(e) => setScopeFilled(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #EBEBEB"
              }}
            >
              <option value="selection">Apply to Selection</option>
              <option value="page">Apply to Page</option>
              <option value="document">Apply to Document</option>
            </select>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #EBEBEB"
              }}
            />
            <button
              style={{
                width: "100%",
                padding: 10,
                backgroundColor: "#FFA000",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 14,
                cursor: "pointer"
              }}
              onClick={() =>
                postMessage({
                  scope: scopeFilled,
                  command: "filled",
                  strokeWidth
                })
              }
            >
              {getButtonLabel("filled", scopeFilled)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
