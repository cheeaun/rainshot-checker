const $ = (id) => document.getElementById(id);
const $$ = (s) => document.querySelector(s);

const canvas = $('rainarea');
const ctx = canvas.getContext('2d');

const timeID = (id) =>
  (id.match(/\d{4}$/) || [''])[0].replace(/(\d{2})(\d{2})/, (m, m1, m2) => {
    let h = parseInt(m1, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h == 0) h = 12;
    if (h > 12) h -= 12;
    return h + ':' + m2 + ' ' + ampm;
  });

const intensityColors = [
  '#40FFFD',
  '#3BEEEC',
  '#32D0D2',
  '#2CB9BD',
  '#229698',
  '#1C827D',
  '#1B8742',
  '#229F44',
  '#27B240',
  '#2CC53B',
  '#30D43E',
  '#38EF46',
  '#3BFB49',
  '#59FA61',
  '#FEFB63',
  '#FDFA53',
  '#FDEB50',
  '#FDD74A',
  '#FCC344',
  '#FAB03F',
  '#FAA23D',
  '#FB8938',
  '#FB7133',
  '#F94C2D',
  '#F9282A',
  '#DD1423',
  '#BE0F1D',
  '#B21867',
  '#D028A6',
  '#F93DF5',
];

function convertRadar2Values(radar, width, height) {
  const rows = radar.trimEnd().split(/\n/g);
  const values = new Array(width * height).fill(0);
  canvas.width = width;
  canvas.height = height;
  for (let y = 0, l = rows.length; y < l; y++) {
    const chars = rows[y];
    for (let x = chars.search(/[^\s]/), rl = chars.length; x < rl; x++) {
      const char = chars[x];
      if (char && char !== ' ') {
        const intensity = char.charCodeAt() - 33;
        values[y * width + x] = intensity;

        const color =
          intensityColors[
            Math.round((intensity / 100) * intensityColors.length)
          ];
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return values;
}

const { contours, geoPath, path, curveCatmullRomClosed } = d3;
const contour = contours()
  .thresholds([4, 10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95, 97.5])
  .smooth(false);
const svgPath = geoPath();
function simplifyCon(conValue) {
  const { coordinates } = conValue;
  if (coordinates.length) {
    conValue.coordinates = coordinates.map((c1) =>
      c1.map((c2) =>
        simplify(
          c2.map(([x, y]) => ({ x, y })),
          0.2, // Adjust this
        ).map(({ x, y }) => [x, y]),
      ),
    );
  }
  return conValue;
}

function curveContext(curve) {
  return {
    moveTo(x, y) {
      curve.lineStart();
      curve.point(x, y);
    },
    lineTo(x, y) {
      curve.point(x, y);
    },
    closePath() {
      curve.lineEnd();
    },
  };
}
function geoCurvePath(curve, projection, context) {
  return (object) => {
    const pathContext = context === undefined ? path() : context;
    geoPath(projection, curveContext(curve(pathContext)))(object);
    return context === undefined ? pathContext + '' : undefined;
  };
}

function cut(start, end, ratio) {
  const r1 = [
    start[0] * (1 - ratio) + end[0] * ratio,
    start[1] * (1 - ratio) + end[1] * ratio,
  ];
  const r2 = [
    start[0] * ratio + end[0] * (1 - ratio),
    start[1] * ratio + end[1] * (1 - ratio),
  ];
  return [r1, r2];
}
function chaikin(curve, iterations = 1, closed = false, ratio = 0.25) {
  if (ratio > 0.5) {
    ratio = 1 - ratio;
  }

  for (let i = 0; i < iterations; i++) {
    let refined = [];
    refined.push(curve[0]);

    for (let j = 1; j < curve.length; j++) {
      let points = cut(curve[j - 1], curve[j], ratio);
      refined = refined.concat(points);
    }

    if (closed) {
      refined = refined.concat(cut(curve[curve.length - 1], curve[0], ratio));
    } else {
      refined.push(curve[curve.length - 1]);
    }

    curve = refined;
  }
  return curve;
}
function chaikinPath(conValue) {
  const { coordinates } = conValue;
  if (coordinates.length) {
    conValue.coordinates = coordinates.map((c1) => c1.map((c2) => chaikin(c2)));
  }
  return svgPath(conValue);
}

let smoothingMode = null;
function convertValues2SVG(values, width, height) {
  const conValues = contour.size([width, height])(values);
  let svg = '';
  for (let i = 0, l = conValues.length; i < l; i++) {
    const con = simplifyCon(conValues[i]);
    let d;
    switch (smoothingMode) {
      case 'chaikin': {
        d = chaikinPath(con);
        break;
      }
      case 'catmull': {
        d = geoCurvePath(curveCatmullRomClosed)(con);
        break;
      }
      default:
        d = svgPath(con);
    }
    const intensity = con.value;
    if (intensity && d) {
      const fill =
        intensityColors[Math.round((con.value / 100) * intensityColors.length)];
      const opacity = intensity > 90 ? 1 : 0.4;
      svg += `<path d="${d}" fill="${fill}" fill-opacity="${opacity}" />`;
    }
  }
  return svg;
}

const handleData = (data) => {
  const { width, height, radar, id } = data;
  const values = convertRadar2Values(radar, width, height);
  console.log({ data, values });

  // Contoured
  const $smooth = $('smooth');
  $smooth.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const svg = convertValues2SVG(values, width, height);
  $smooth.innerHTML = svg;

  const $contour = $('contour-select');
  $contour.onchange = () => {
    smoothingMode = $contour.options[$contour.selectedIndex].value || null;
    const svg = convertValues2SVG(values, width, height);
    $smooth.innerHTML = svg;
  };

  // Time
  $('datetime').innerHTML = timeID(id);

  // Comparison
  const $slider = $('slider');
  new BeerSlider($slider);

  // Zoom ranger
  const $scrollable = $('scrollable');
  const $zoom = $('zoom-ranger');
  const $handle = $$('.beer-handle');
  let prevValue = 1;
  $zoom.oninput = () => {
    const value = Number($zoom.value);
    $slider.style.zoom = value;
    $handle.style.zoom = 1 / value;

    const zoomState = value > prevValue ? 'in' : 'out';
    const diffValue = Math.abs(value - prevValue);
    prevValue = value;
    // MUCH MATH HERE YOOOO
    const scrollX =
      (diffValue / 2) * $scrollable.offsetWidth * (zoomState == 'in' ? 1 : -1);
    $scrollable.scrollBy(scrollX, 0);
  };
};

const fetchData = () =>
  fetch('https://api.checkweather.sg/v2/rainarea')
    .then((r) => r.json())
    .then((data) => {
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    })
    .then(handleData);

const cacheKey = 'rainarea';
const cachedData = localStorage.getItem(cacheKey);
if (cachedData) {
  handleData(JSON.parse(cachedData));
} else {
  fetchData();
}

$('reload').onclick = (e) => {
  e.preventDefault();
  localStorage.removeItem(cacheKey);
  fetchData();
};
